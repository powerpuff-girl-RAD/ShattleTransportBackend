const journeyService = require('../service/journey.service');

const board = async (req, res, next) => {
    try {
        const { tokenSerial, routeId, boardingStopId, boardingStopName } = req.body;
        const result = await journeyService.validateBoarding(req.user.id, {
            tokenSerial,
            routeId,
            boardingStopId,
            boardingStopName,
        });

        res.status(200).json({
            success: result.status === 'Accepted',
            ...result,
        });
    } catch (error) {
        next(error);
    }
};

const alight = async (req, res, next) => {
    try {
        const { tokenSerial, alightingStopId, alightingStopName, isPeak } = req.body;
        const result = await journeyService.validateAlighting(req.user.id, {
            tokenSerial,
            alightingStopId,
            alightingStopName,
            isPeak,
        });

        res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
};

const getActive = async (req, res, next) => {
    try {
        const journey = await journeyService.getActiveJourney(req.user.id);
        res.status(200).json({
            success: true,
            activeJourney: journey,
        });
    } catch (error) {
        next(error);
    }
};

const getHistory = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 20;
        const history = await journeyService.getPassengerHistory(req.user.id, limit);
        res.status(200).json({
            success: true,
            history,
        });
    } catch (error) {
        next(error);
    }
};

const getEstimate = async (req, res, next) => {
    try {
        const { routeId, fromStation, toStation, isPeak } = req.body;
        const estimate = await journeyService.getFareEstimate({
            routeId,
            fromStation,
            toStation,
            isPeak,
        });
        res.status(200).json({
            success: true,
            data: estimate,
        });
    } catch (error) {
        next(error);
    }
};

const getNotifications = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 20;
        const notifications = await journeyService.getNotifications(req.user.id, limit);
        res.status(200).json({
            success: true,
            notifications,
        });
    } catch (error) {
        next(error);
    }
};

const markRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        await journeyService.markNotificationRead(req.user.id, id);
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    board,
    alight,
    getActive,
    getHistory,
    getEstimate,
    getNotifications,
    markRead,
};