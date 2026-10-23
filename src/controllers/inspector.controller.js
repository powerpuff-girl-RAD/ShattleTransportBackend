const inspectorService = require("../service/inspector.service");
const ticketingService = require("../service/ticketing.service");

const getDashboard = async (req, res, next) => {
    try {
        const dashboard = await inspectorService.getDashboard(req.user.id);
        res.status(200).json({ success: true, ...dashboard });
    } catch (error) {
        next(error);
    }
};

const startShift = async (req, res, next) => {
    try {
        const shift = await inspectorService.startShift(req.user.id);
        res.status(200).json({ success: true, message: "Shift started", shift });
    } catch (error) {
        next(error);
    }
};

const endShift = async (req, res, next) => {
    try {
        const { shift, settlement } = await inspectorService.endShift(req.user.id);
        res.status(200).json({ success: true, message: "Shift ended", shift, settlement });
    } catch (error) {
        next(error);
    }
};

// POST /scan — first scan taps in, second taps out (charges the booked fare), third is rejected
const scan = async (req, res, next) => {
    try {
        const { qrPayload, tokenSerial } = req.body;
        const result = await ticketingService.scan(req.user.id, { qrPayload, tokenSerial });
        res.status(result.action === "TAP_IN" ? 201 : 200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

// POST /validate — read-only VALID / INVALID for the current shift's route
const validate = async (req, res, next) => {
    try {
        const { qrPayload, tokenSerial } = req.body;
        const result = await ticketingService.validate(req.user.id, { qrPayload, tokenSerial });
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

// POST /shifts/:id/settle — re-run settlement for one of your ended shifts (safe to repeat)
const settleShift = async (req, res, next) => {
    try {
        const settlement = await ticketingService.settleShift(req.params.id, { inspectorId: req.user.id });
        res.status(200).json({ success: true, settlement });
    } catch (error) {
        next(error);
    }
};

const inspect = async (req, res, next) => {
    try {
        const { qrPayload, tokenSerial } = req.body;
        const result = await inspectorService.inspect(req.user.id, { qrPayload, tokenSerial });
        res.status(201).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

const listInspections = async (req, res, next) => {
    try {
        const { date, route, bus, result } = req.query;
        const data = await inspectorService.listInspections(req.user.id, { date, route, bus, result });
        res.status(200).json({ success: true, ...data });
    } catch (error) {
        next(error);
    }
};

const getInspection = async (req, res, next) => {
    try {
        const inspection = await inspectorService.getInspection(req.user.id, req.params.id);
        res.status(200).json({ success: true, inspection });
    } catch (error) {
        next(error);
    }
};

const recordViolation = async (req, res, next) => {
    try {
        const { inspectionId, violationType, location, notes } = req.body;
        const violation = await inspectorService.recordViolation(req.user.id, { inspectionId, violationType, location, notes });
        res.status(201).json({ success: true, message: "Violation recorded", violation });
    } catch (error) {
        next(error);
    }
};

const listViolations = async (req, res, next) => {
    try {
        const violations = await inspectorService.listViolations(req.user.id);
        res.status(200).json({ success: true, violations });
    } catch (error) {
        next(error);
    }
};

const getStats = async (req, res, next) => {
    try {
        const stats = await inspectorService.getStats(req.user.id, req.query.days || 7);
        res.status(200).json({ success: true, ...stats });
    } catch (error) {
        next(error);
    }
};

const getInvalidTicketReport = async (req, res, next) => {
    try {
        const { from, to, route } = req.query;
        const report = await inspectorService.getInvalidTicketReport({ from, to, route });
        res.status(200).json({ success: true, ...report });
    } catch (error) {
        next(error);
    }
};

const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        await inspectorService.changePassword(req.user.id, { currentPassword, newPassword });
        res.status(200).json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        next(error);
    }
};

const getUpcomingSchedule = async (req, res, next) => {
    try {
        const schedule = await inspectorService.getUpcomingSchedule(req.user.id);
        res.status(200).json({ success: true, schedule });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDashboard,
    startShift,
    endShift,
    scan,
    validate,
    settleShift,
    inspect,
    listInspections,
    getInspection,
    recordViolation,
    listViolations,
    getStats,
    getInvalidTicketReport,
    changePassword,
    getUpcomingSchedule
};
