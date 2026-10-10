const bookingService = require('../service/booking.service');

/**
 * GET /api/booking/routes?date=YYYY-MM-DD
 * Returns routes with embedded schedules on that date.
 */
const getRoutes = async (req, res, next) => {
    try {
        const { date } = req.query;
        const result = await bookingService.getAvailableRoutesWithSchedules(date);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/booking/routes/:routeId?date=YYYY-MM-DD
 * Returns a specific route with stops and schedules on that date.
 */
const getRouteDetails = async (req, res, next) => {
    try {
        const { routeId } = req.params;
        const { date } = req.query;
        const result = await bookingService.getRouteBookingDetails(routeId, date);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/booking/calculate-fare
 * Pre-calculates journey fare before final booking.
 */
const calculateFare = async (req, res, next) => {
    try {
        const { routeId, boardingStopId, alightingStopId, isPeak } = req.body;
        const result = await bookingService.calculateBookingFare({
            routeId,
            boardingStopId,
            alightingStopId,
            isPeak,
        });
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/booking
 * Creates a new journey booking and reserves/deducts fare from balance.
 */
const createBooking = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const result = await bookingService.createBooking(userId, req.body);
        res.status(201).json({
            success: true,
            message: 'Journey booked successfully',
            ...result,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/booking/:bookingId/activate-token
 * Activates token & pass method for a specific booking and returns QR payload.
 */
const activateToken = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { bookingId } = req.params;
        const { passType } = req.body;
        const updatedBooking = await bookingService.activateBookingToken(userId, bookingId, { passType });
        res.status(200).json({
            success: true,
            message: `${passType || 'QR'} token activated for booking #${updatedBooking.BookingRef}`,
            booking: updatedBooking,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/booking
 * Retrieves all bookings for the authenticated passenger.
 */
const getUserBookings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { limit } = req.query;
        const bookings = await bookingService.getUserBookings(userId, limit);
        res.status(200).json({ success: true, bookings });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/booking/:bookingId
 * Retrieves details for a specific booking.
 */
const getBookingById = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { bookingId } = req.params;
        const booking = await bookingService.getBookingById(userId, bookingId);
        res.status(200).json({ success: true, booking });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/booking/:bookingId/cancel
 * Cancels a booking and refunds fare to passenger wallet.
 */
const cancelBooking = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { bookingId } = req.params;
        const result = await bookingService.cancelBooking(userId, bookingId);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRoutes,
    getRouteDetails,
    calculateFare,
    createBooking,
    activateToken,
    getUserBookings,
    getBookingById,
    cancelBooking,
};