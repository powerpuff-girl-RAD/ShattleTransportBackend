const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const { getCollection } = require('../config/database');
const bookingRepository = require('../repository/booking.repository');
const notificationRepository = require('../repository/notification.repository');
const { calculateFare } = require('./journey.service');

const NO_ID = { projection: { _id: 0 } };

/**
 * 1. Retrieves routes with their schedules on a selected date.
 */
const getAvailableRoutesWithSchedules = async (date) => {
    const selectedDate = date || new Date().toISOString().split('T')[0];

    const routesCol = await getCollection('routes');
    const schedulesCol = await getCollection('schedules');

    const [allRoutes, schedules] = await Promise.all([
        routesCol.find({}, NO_ID).toArray(),
        schedulesCol.find({
            Date: selectedDate,
            $or: [{ Deleted: 0 }, { Deleted: { $exists: false } }],
            Status: { $ne: 'Cancelled' },
        }, NO_ID).sort({ StartTime: 1 }).toArray(),
    ]);

    // Attach schedules to each route
    const routesWithSchedules = allRoutes.map((route) => {
        const routeSchedules = schedules.filter((s) => Number(s.RouteId) === Number(route.Id));
        return {
            ...route,
            schedulesCount: routeSchedules.length,
            schedules: routeSchedules,
        };
    });

    return {
        date: selectedDate,
        totalRoutes: routesWithSchedules.length,
        routes: routesWithSchedules,
    };
};

/**
 * 2. Retrieves a single route's full stops and schedules for a selected date.
 */
const getRouteBookingDetails = async (routeId, date) => {
    const selectedDate = date || new Date().toISOString().split('T')[0];

    const routesCol = await getCollection('routes');
    const schedulesCol = await getCollection('schedules');

    const route = await routesCol.findOne({ Id: Number(routeId) }, NO_ID);
    if (!route) {
        const error = new Error('Route not found');
        error.statusCode = 404;
        throw error;
    }

    const schedules = await schedulesCol
        .find({
            RouteId: Number(routeId),
            Date: selectedDate,
            $or: [{ Deleted: 0 }, { Deleted: { $exists: false } }],
        }, NO_ID)
        .sort({ StartTime: 1 })
        .toArray();

    return {
        route,
        date: selectedDate,
        schedules,
    };
};

/**
 * 3. Calculates the fare for a trip on a route between boarding and alighting stops.
 */
const calculateBookingFare = async ({ routeId, boardingStopId, alightingStopId, isPeak = true }) => {
    const routesCol = await getCollection('routes');
    const route = await routesCol.findOne({ Id: Number(routeId) }, NO_ID);
    if (!route) {
        const error = new Error('Route not found');
        error.statusCode = 404;
        throw error;
    }

    const stops = route.stops || [];
    const bStop = stops.find((s) => Number(s.Id) === Number(boardingStopId));
    const aStop = stops.find((s) => Number(s.Id) === Number(alightingStopId));

    if (!bStop || !aStop) {
        const error = new Error('Invalid boarding or alighting stop selected');
        error.statusCode = 400;
        throw error;
    }

    if (bStop.Id === aStop.Id) {
        const error = new Error('Boarding stop and alighting stop cannot be the same');
        error.statusCode = 400;
        throw error;
    }

    const bKm = Number(bStop.DistanceFromStartKm || 0);
    const aKm = Number(aStop.DistanceFromStartKm || 0);
    const distanceKm = Math.max(1, Math.abs(aKm - bKm));

    const fareCalc = await calculateFare(distanceKm, isPeak);

    return {
        routeId: route.Id,
        routeNumber: route.RouteNumber,
        routeName: route.RouteName,
        boardingStop: bStop,
        alightingStop: aStop,
        distanceKm,
        fareAmount: fareCalc.fareAmount,
        isPeak: fareCalc.isPeak,
    };
};

/**
 * 4. Creates a new journey booking.
 * - Calculates fare
 * - Checks passenger wallet balance
 * - Deducts fare atomically
 * - Generates unique booking ref & token serial
 * - Creates booking record with 'Booked' and 'PendingActivation' status
 */
const createBooking = async (userId, payload) => {
    const {
        routeId,
        scheduleId,
        boardingStopId,
        alightingStopId,
        isPeak = true,
    } = payload;

    if (!routeId || !scheduleId || !boardingStopId || !alightingStopId) {
        const error = new Error('Missing required booking fields (routeId, scheduleId, boardingStopId, alightingStopId)');
        error.statusCode = 400;
        throw error;
    }

    // 1. Verify passenger account & balance
    const accountsCol = await getCollection('passengerAccounts');
    let account = await accountsCol.findOne({ UserId: Number(userId) }, NO_ID);
    if (!account) {
        account = {
            UserId: Number(userId),
            Balance: 0,
            AccountStatus: 'Active',
            CreatedAt: new Date().toISOString(),
        };
        await accountsCol.insertOne(account);
    }

    // 2. Resolve route and schedule
    const routesCol = await getCollection('routes');
    const schedulesCol = await getCollection('schedules');

    const [route, schedule] = await Promise.all([
        routesCol.findOne({ Id: Number(routeId) }, NO_ID),
        schedulesCol.findOne({ Id: Number(scheduleId) }, NO_ID),
    ]);

    if (!route) {
        const error = new Error('Selected route does not exist');
        error.statusCode = 404;
        throw error;
    }

    if (!schedule) {
        const error = new Error('Selected schedule does not exist');
        error.statusCode = 404;
        throw error;
    }

    // 3. Calculate fare
    const fareInfo = await calculateBookingFare({
        routeId,
        boardingStopId,
        alightingStopId,
        isPeak,
    });

    const fareAmount = fareInfo.fareAmount;

    // 4. Verify wallet balance
    if (account.Balance < fareAmount) {
        const error = new Error(
            `Insufficient wallet balance. Total fare is LKR ${fareAmount.toFixed(2)}, but your current balance is LKR ${account.Balance.toFixed(2)}. Please top up your wallet to continue.`
        );
        error.statusCode = 400;
        error.code = 'ERR-BK-INSUFFICIENT_BALANCE';
        error.data = {
            requiredFare: fareAmount,
            currentBalance: account.Balance,
            difference: fareAmount - account.Balance,
        };
        throw error;
    }

    // 5. Deduct fare atomically from passenger account
    const updatedAccount = await accountsCol.findOneAndUpdate(
        { UserId: Number(userId), Balance: { $gte: fareAmount } },
        { $inc: { Balance: -fareAmount } },
        { ...NO_ID, returnDocument: 'after' }
    );

    if (!updatedAccount) {
        const error = new Error('Account balance changed or insufficient during transaction');
        error.statusCode = 400;
        throw error;
    }

    // 6. Generate isolated Booking Reference and Token Serial
    const dateCompact = (schedule.Date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const bookingRef = `BK-${dateCompact}-${randomSuffix}`;
    const tokenSerial = `TK-BK-${Math.floor(10000 + Math.random() * 90000)}`;

    const timeSlotStr = `${schedule.StartTime} - ${schedule.EndTime}`;

    // 7. Insert booking document
    const bookingDoc = {
        BookingRef: bookingRef,
        UserId: Number(userId),
        RouteId: Number(route.Id),
        RouteNumber: route.RouteNumber,
        RouteName: route.RouteName,
        ScheduleId: Number(schedule.Id),
        ScheduleDate: schedule.Date,
        TimeSlot: timeSlotStr,
        SlotLabel: schedule.SlotLabel || 'Standard Schedule',
        BoardingStop: {
            StopId: fareInfo.boardingStop.Id,
            StopName: fareInfo.boardingStop.StopName,
            DistanceFromStartKm: fareInfo.boardingStop.DistanceFromStartKm,
        },
        AlightingStop: {
            StopId: fareInfo.alightingStop.Id,
            StopName: fareInfo.alightingStop.StopName,
            DistanceFromStartKm: fareInfo.alightingStop.DistanceFromStartKm,
        },
        DistanceKm: fareInfo.distanceKm,
        FareAmount: fareAmount,
        IsPeak: fareInfo.isPeak,
        PassType: null, // Pending pass type selection
        TokenSerial: tokenSerial,
        TokenStatus: 'PendingActivation',
        QrPayload: null,
        Status: 'Booked',
    };

    const newBooking = await bookingRepository.createBooking(bookingDoc);

    // 8. Trigger booking confirmation notification
    await notificationRepository.createNotification({
        userId: Number(userId),
        type: 'BoardingConfirmation',
        title: `Journey Booked: Route ${route.RouteNumber}`,
        message: `Your trip from ${fareInfo.boardingStop.StopName} to ${fareInfo.alightingStop.StopName} on ${schedule.Date} (${timeSlotStr}) is booked. Fare: LKR ${fareAmount.toFixed(2)}.`,
        data: {
            bookingId: newBooking.Id,
            bookingRef: newBooking.BookingRef,
            tokenSerial: newBooking.TokenSerial,
            fareAmount,
        },
    });

    return {
        booking: newBooking,
        newBalance: updatedAccount.Balance,
    };
};

/**
 * 5. Activates the token and selects the pass method for a specific booking.
 * Generates an isolated QR payload containing booking details.
 */
const activateBookingToken = async (userId, bookingId, { passType = 'QR' }) => {
    const booking = await bookingRepository.getBookingById(bookingId, userId);
    if (!booking) {
        const error = new Error('Booking not found or access denied');
        error.statusCode = 404;
        throw error;
    }

    if (booking.Status === 'Cancelled') {
        const error = new Error('Cannot activate token for a cancelled booking');
        error.statusCode = 400;
        throw error;
    }

    const validPassTypes = ['QR', 'Smartcard', 'Barcode'];
    if (!validPassTypes.includes(passType)) {
        const error = new Error(`Invalid pass method. Supported types: ${validPassTypes.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }

    // Generate isolated signed QR JWT containing full booking metadata
    const nonce = crypto.randomBytes(8).toString('hex');
    const qrJwt = jwt.sign(
        {
            bookingId: booking.Id,
            bookingRef: booking.BookingRef,
            tokenSerial: booking.TokenSerial,
            userId: Number(userId),
            routeId: booking.RouteId,
            routeNumber: booking.RouteNumber,
            routeName: booking.RouteName,
            boardingStop: booking.BoardingStop.StopName,
            alightingStop: booking.AlightingStop.StopName,
            scheduleDate: booking.ScheduleDate,
            timeSlot: booking.TimeSlot,
            fareAmount: booking.FareAmount,
            passType,
            nonce,
        },
        env.jwt.qrSecret,
        { expiresIn: '7d' } // Valid for the scheduled travel window
    );

    // Update booking document
    const updatedBooking = await bookingRepository.updateBooking(booking.Id, {
        PassType: passType,
        TokenStatus: 'Active',
        QrPayload: qrJwt,
        TokenActivatedAt: new Date().toISOString(),
    });

    // Also register in passengerTokens collection so gate scanners recognize it
    const tokensCol = await getCollection('passengerTokens');
    await tokensCol.updateOne(
        { TokenSerial: booking.TokenSerial },
        {
            $set: {
                TokenSerial: booking.TokenSerial,
                UserId: Number(userId),
                TokenType: passType,
                Status: 'Active',
                BookingId: booking.Id,
                BookingRef: booking.BookingRef,
                IsBookingToken: true,
                UpdatedAt: new Date().toISOString(),
            },
            $setOnInsert: {
                CreatedAt: new Date().toISOString(),
            },
        },
        { upsert: true }
    );

    // Send notification
    await notificationRepository.createNotification({
        userId: Number(userId),
        type: 'BoardingConfirmation',
        title: `Digital Token Activated: ${booking.TokenSerial}`,
        message: `${passType} token activated for journey ${booking.BookingRef}. Present your token at the transit gate to board.`,
        data: {
            bookingId: booking.Id,
            tokenSerial: booking.TokenSerial,
            passType,
        },
    });

    return updatedBooking;
};

/**
 * 6. Retrieves all bookings for a passenger.
 */
const getUserBookings = async (userId, limit = 50) => {
    return await bookingRepository.getUserBookings(userId, limit);
};

/**
 * 7. Retrieves a single booking by Id.
 */
const getBookingById = async (userId, bookingId) => {
    const booking = await bookingRepository.getBookingById(bookingId, userId);
    if (!booking) {
        const error = new Error('Booking not found');
        error.statusCode = 404;
        throw error;
    }
    return booking;
};

/**
 * 8. Cancels a booking and refunds the fare back to passenger account.
 */
const cancelBooking = async (userId, bookingId) => {
    const booking = await bookingRepository.getBookingById(bookingId, userId);
    if (!booking) {
        const error = new Error('Booking not found');
        error.statusCode = 404;
        throw error;
    }

    if (booking.Status === 'Cancelled') {
        const error = new Error('Booking is already cancelled');
        error.statusCode = 400;
        throw error;
    }

    if (booking.Status === 'InProgress' || booking.Status === 'Completed') {
        const error = new Error(`Cannot cancel a journey that is already ${booking.Status.toLowerCase()}`);
        error.statusCode = 400;
        throw error;
    }

    // Refund fare back to passenger account
    const accountsCol = await getCollection('passengerAccounts');
    const updatedAccount = await accountsCol.findOneAndUpdate(
        { UserId: Number(userId) },
        { $inc: { Balance: booking.FareAmount } },
        { ...NO_ID, returnDocument: 'after' }
    );

    // Update booking status
    const updatedBooking = await bookingRepository.updateBooking(booking.Id, {
        Status: 'Cancelled',
        TokenStatus: 'Cancelled',
        CancelledAt: new Date().toISOString(),
    });

    // Deactivate in passengerTokens
    const tokensCol = await getCollection('passengerTokens');
    await tokensCol.updateOne(
        { TokenSerial: booking.TokenSerial },
        { $set: { Status: 'Deactivated', UpdatedAt: new Date().toISOString() } }
    );

    // Send refund notification
    await notificationRepository.createNotification({
        userId: Number(userId),
        type: 'FareDeduction',
        title: `Booking Cancelled & Refunded`,
        message: `Booking ${booking.BookingRef} was cancelled. LKR ${booking.FareAmount.toFixed(2)} has been refunded to your wallet.`,
        data: {
            bookingId: booking.Id,
            refundedAmount: booking.FareAmount,
            newBalance: updatedAccount?.Balance,
        },
    });

    return {
        message: 'Booking cancelled successfully and fare refunded to wallet',
        booking: updatedBooking,
        refundedAmount: booking.FareAmount,
        newBalance: updatedAccount?.Balance,
    };
};

module.exports = {
    getAvailableRoutesWithSchedules,
    getRouteBookingDetails,
    calculateBookingFare,
    createBooking,
    activateBookingToken,
    getUserBookings,
    getBookingById,
    cancelBooking,
};