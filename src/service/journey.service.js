const journeyRepository = require('../repository/journey.repository');
const notificationRepository = require('../repository/notification.repository');
const tokenRepository = require('../repository/token.repository');
const passengerRepository = require('../repository/passenger.repository');
const routeRepository = require('../repository/route.repository');
const fareRepository = require('../repository/fare.repository');
const { getCollection, NO_ID } = require('../config/database');

const MINIMUM_BOARDING_BALANCE = 30.00;
const LOW_BALANCE_THRESHOLD = 100.00;

/**
 * Checks if current time is within peak hours (06:30-09:00 or 16:30-19:30 on weekdays).
 */
const isCurrentTimePeak = () => {
    const now = new Date();
    const day = now.getDay(); // 0 is Sun, 6 is Sat
    if (day === 0 || day === 6) return false;

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeVal = hours * 60 + minutes;

    const morningStart = 6 * 60 + 30; // 06:30
    const morningEnd   = 9 * 60;      // 09:00
    const eveningStart = 16 * 60 + 30; // 16:30
    const eveningEnd   = 19 * 60 + 30; // 19:30

    return (timeVal >= morningStart && timeVal <= morningEnd) ||
           (timeVal >= eveningStart && timeVal <= eveningEnd);
};

/**
 * Calculates fare amount using distance tiers and peak pricing.
 */
const calculateFare = async (distanceKm, isPeakSpecified) => {
    const dist = Math.max(1, Number(distanceKm) || 1);
    const isPeak = typeof isPeakSpecified === 'boolean' ? isPeakSpecified : isCurrentTimePeak();

    // Query fareDistance collection
    const distanceFaresCol = await getCollection('fareDistance');
    const tiers = await distanceFaresCol.find({}, NO_ID).toArray();

    let baseFare = null;
    let offPeakFare = null;

    if (tiers && tiers.length > 0) {
        // Find matching tier
        const matched = tiers.find(t => dist >= Number(t.Minkm) && (Number(t.Maxkm) === 0 || dist <= Number(t.Maxkm)));
        if (matched) {
            baseFare = Number(matched.StandardFare);
            offPeakFare = Number(matched.OffPeakFare || matched.StandardFare);
        }
    }

    // Default distance fallback matrix if tiers not configured in DB
    if (!baseFare) {
        if (dist <= 5)       { baseFare = 30;  offPeakFare = 25; }
        else if (dist <= 10) { baseFare = 50;  offPeakFare = 40; }
        else if (dist <= 15) { baseFare = 70;  offPeakFare = 60; }
        else if (dist <= 20) { baseFare = 90;  offPeakFare = 75; }
        else if (dist <= 30) { baseFare = 130; offPeakFare = 110; }
        else if (dist <= 50) { baseFare = 170; offPeakFare = 145; } // e.g. Negombo -> Colombo (38 km) = 170
        else                 { baseFare = 200; offPeakFare = 170; }
    }

    const calculatedFare = isPeak ? baseFare : offPeakFare;

    return {
        distanceKm: dist,
        fareAmount: Math.round(calculatedFare * 100) / 100,
        isPeak,
    };
};

/**
 * 1. GateScannerUI -> TicketingController.validateBoarding(tokenId, boardingStop)
 */
const validateBoarding = async (userId, {
    tokenSerial,
    routeId,
    boardingStopId,
    boardingStopName,
}) => {
    // 1. DigitalToken.isValid(tokenId)
    const token = await tokenRepository.getTokenBySerial(tokenSerial);
    const isOwner = token && Number(token.UserId) === Number(userId);
    const isTokenActive = token && token.Status === 'Active' && isOwner;

    if (!isTokenActive) {
        await notificationRepository.createNotification({
            userId,
            type: 'InsufficientCredit',
            title: 'Boarding Rejected',
            message: 'Your token could not be verified. Token is expired, invalid, or unlinked.',
            data: { errorCode: 'ERR-TK-4021', tokenSerial },
        });

        return {
            status: 'Rejected',
            errorCode: 'ERR-TK-4021',
            message: 'Your token could not be verified. This may be due to an expired or invalid token.',
            tokenSerial,
            remainingBalance: 0,
        };
    }

    // 2. PassengerAccount.getBalance(accountId)
    const account = await passengerRepository.getOrCreateAccount(userId);
    const balance = Number(account.Balance || 0);

    // Check balance sufficiency
    if (balance < MINIMUM_BOARDING_BALANCE) {
        await notificationRepository.createNotification({
            userId,
            type: 'InsufficientCredit',
            title: 'Insufficient Credit',
            message: `Your token could not be verified due to insufficient credit (LKR ${balance.toFixed(2)} remaining).`,
            data: { errorCode: 'ERR-TK-4021', tokenSerial, remainingBalance: balance },
        });

        return {
            status: 'Rejected',
            errorCode: 'ERR-TK-4021',
            message: `Your token could not be verified. This may be due to insufficient credit (LKR ${balance.toFixed(2)} remaining) or an expired token.`,
            tokenSerial,
            remainingBalance: balance,
        };
    }

    // 3. Resolve route & boarding stop details
    const routesCol = await getCollection('routes');
    const route = await routesCol.findOne({ Id: Number(routeId) }, NO_ID);

    const routeNumber = route?.RouteNumber || '245';
    const routeName   = route?.RouteName || 'Negombo - Colombo Fort';

    let stopDistance = 0;
    if (route && Array.isArray(route.stops)) {
        const foundStop = route.stops.find(s =>
            (boardingStopId && s.Id === Number(boardingStopId)) ||
            (boardingStopName && s.StopName.toLowerCase() === boardingStopName.toLowerCase())
        );
        if (foundStop) {
            stopDistance = Number(foundStop.DistanceFromStartKm || 0);
            boardingStopName = foundStop.StopName;
        }
    }

    const boardingStopObj = {
        stopId: boardingStopId || 1,
        stopName: boardingStopName || route?.StartLocation || 'Negombo Bus Stand',
        distanceFromStartKm: stopDistance,
    };

    // 4. Journey.startJourney(...)
    const journey = await journeyRepository.startJourney({
        userId,
        tokenSerial,
        routeId: route?.Id || Number(routeId || 1),
        routeNumber,
        routeName,
        boardingStop: boardingStopObj,
    });

    // Mark token used
    await tokenRepository.markTokenUsed(tokenSerial);

    // 5. NotificationService.sendScanConfirmation()
    await notificationRepository.createNotification({
        userId,
        type: 'BoardingConfirmation',
        title: 'Tapped in — boarding Accepted',
        message: `Boarding accepted on Route ${routeNumber} (${routeName}) at ${boardingStopObj.stopName}. Tap out at destination to pay.`,
        data: {
            journeyId: journey.Id,
            tokenSerial,
            routeNumber,
            routeName,
            boardingStop: boardingStopObj.stopName,
            balance,
        },
    });

    return {
        status: 'Accepted',
        journey: {
            id: journey.Id,
            tokenSerial,
            routeId: journey.RouteId,
            routeNumber,
            routeName,
            boardingStop: journey.BoardingStop,
            tapInTime: journey.BoardingStop.Timestamp,
            status: 'InProgress',
        },
        tokenSerial,
        balance,
        message: 'Tapped in — boarding Accepted',
    };
};

/**
 * 2. GateScannerUI -> TicketingController.validateAlighting(tokenId, alightingStop)
 */
const validateAlighting = async (userId, {
    tokenSerial,
    alightingStopId,
    alightingStopName,
    isPeak,
}) => {
    // 1. Find InProgress journey
    const activeJourney = await journeyRepository.getActiveJourney(userId);
    if (!activeJourney) {
        const err = new Error('No active ongoing journey found. Please tap in at a boarding gate first.');
        err.statusCode = 400;
        throw err;
    }

    // 2. Resolve alighting stop and distance
    const routesCol = await getCollection('routes');
    const route = await routesCol.findOne({ Id: Number(activeJourney.RouteId) }, NO_ID);

    let alightingKm = route?.DistanceKm || 38;
    if (route && Array.isArray(route.stops)) {
        const foundStop = route.stops.find(s =>
            (alightingStopId && s.Id === Number(alightingStopId)) ||
            (alightingStopName && s.StopName.toLowerCase() === alightingStopName.toLowerCase())
        );
        if (foundStop) {
            alightingKm = Number(foundStop.DistanceFromStartKm);
            alightingStopName = foundStop.StopName;
        }
    }

    const boardingKm = Number(activeJourney.BoardingStop.DistanceFromStartKm || 0);
    const distanceTraveled = Math.max(1, Math.abs(alightingKm - boardingKm));

    // 3. Calculate fare
    const fareResult = await calculateFare(distanceTraveled, isPeak);
    const fareAmount = fareResult.fareAmount;

    // 4. Deduct fare from PassengerAccount
    const accountsCol = await getCollection('passengerAccounts');
    const beforeAccount = await accountsCol.findOneAndUpdate(
        { UserId: Number(userId) },
        { $inc: { Balance: -fareAmount } },
        { ...NO_ID, returnDocument: 'before' }
    );

    const prevBalance = Number(beforeAccount?.Balance || 0);
    const newBalance  = Math.round((prevBalance - fareAmount) * 100) / 100;

    // 5. Complete journey record
    const alightingStopObj = {
        stopId: alightingStopId || 2,
        stopName: alightingStopName || route?.EndLocation || 'Colombo Fort',
        distanceFromStartKm: alightingKm,
    };

    const completedJourney = await journeyRepository.endJourney({
        journeyId: activeJourney.Id,
        userId,
        alightingStop: alightingStopObj,
        distanceKm: distanceTraveled,
        fareAmount,
    });

    // Mark token used
    await tokenRepository.markTokenUsed(activeJourney.TokenSerial);

    // 6. NotificationService.sendFareDeductionNotification(fareAmount)
    await notificationRepository.createNotification({
        userId,
        type: 'FareDeduction',
        title: `Fare deducted: Rs. ${fareAmount.toFixed(2)}`,
        message: `LKR ${fareAmount.toFixed(2)} deducted from your wallet for trip from ${activeJourney.BoardingStop.StopName} to ${alightingStopObj.stopName}.`,
        data: {
            journeyId: activeJourney.Id,
            fareAmount,
            distanceKm: distanceTraveled,
            newBalance,
        },
    });

    // 7. NotificationService.sendJourneyCompletionConfirmation()
    await notificationRepository.createNotification({
        userId,
        type: 'JourneyCompletion',
        title: 'Journey completed',
        message: `Your journey on Route ${activeJourney.RouteNumber} has completed successfully.`,
        data: {
            journeyId: activeJourney.Id,
            routeNumber: activeJourney.RouteNumber,
            from: activeJourney.BoardingStop.StopName,
            to: alightingStopObj.stopName,
        },
    });

    // 8. opt [newBalance < lowBalanceThreshold] -> sendLowBalanceNotification()
    const isLowBalance = newBalance < LOW_BALANCE_THRESHOLD;
    if (isLowBalance) {
        await notificationRepository.createNotification({
            userId,
            type: 'LowBalanceWarning',
            title: 'Low Balance Warning',
            message: `Your wallet balance is low (LKR ${newBalance.toFixed(2)} remaining). Please top up before your next trip.`,
            data: { newBalance, threshold: LOW_BALANCE_THRESHOLD },
        });
    }

    return {
        status: 'Completed',
        journey: completedJourney,
        fareDeducted: fareAmount,
        newBalance,
        lowBalanceWarning: isLowBalance,
        message: 'Tapped out — Journey Completed',
    };
};

/**
 * Gets passenger active journey.
 */
const getActiveJourney = async (userId) => {
    return journeyRepository.getActiveJourney(userId);
};

/**
 * Gets passenger journey history.
 */
const getPassengerHistory = async (userId, limit = 20) => {
    return journeyRepository.getPassengerJourneys(userId, limit);
};

/**
 * Gets passenger notifications.
 */
const getNotifications = async (userId, limit = 20) => {
    return notificationRepository.getUserNotifications(userId, limit);
};

/**
 * Marks notification as read.
 */
const markNotificationRead = async (userId, notificationId) => {
    return notificationRepository.markAsRead(notificationId, userId);
};

/**
 * Fare Estimator for Fare Calculator UI.
 */
const getFareEstimate = async ({ routeId, fromStation, toStation, isPeak }) => {
    const routesCol = await getCollection('routes');
    
    // Find route: check explicit ID, or find route containing these stations, or default to Route 245
    let route = null;
    if (routeId) {
        route = await routesCol.findOne({ Id: Number(routeId) }, NO_ID);
    }
    if (!route && (fromStation || toStation)) {
        route = await routesCol.findOne({
            $or: [
                { 'stops.StopName': new RegExp(fromStation || '', 'i') },
                { 'stops.StopName': new RegExp(toStation || '', 'i') },
                { RouteNumber: '245' }
            ]
        }, NO_ID);
    }
    if (!route) {
        route = await routesCol.findOne({ RouteNumber: '245' }, NO_ID) || await routesCol.findOne({}, NO_ID);
    }

    let fromKm = 0;
    let toKm = route?.DistanceKm || 38;

    if (route && Array.isArray(route.stops)) {
        if (fromStation) {
            const s1 = route.stops.find(s => s.StopName.toLowerCase().includes(fromStation.toLowerCase()));
            if (s1) fromKm = Number(s1.DistanceFromStartKm);
        }
        if (toStation) {
            const s2 = route.stops.find(s => s.StopName.toLowerCase().includes(toStation.toLowerCase()));
            if (s2) toKm = Number(s2.DistanceFromStartKm);
        }
    }

    const dist = Math.max(1, Math.abs(toKm - fromKm));
    const result = await calculateFare(dist, isPeak);

    return {
        fromStation: fromStation || route?.StartLocation || 'Negombo Bus Stand',
        toStation: toStation || route?.EndLocation || 'Colombo Fort',
        distanceKm: dist,
        estimatedFare: result.fareAmount,
        isPeak: result.isPeak,
    };
};

module.exports = {
    validateBoarding,
    validateAlighting,
    getActiveJourney,
    getPassengerHistory,
    getNotifications,
    markNotificationRead,
    getFareEstimate,
    calculateFare,
};