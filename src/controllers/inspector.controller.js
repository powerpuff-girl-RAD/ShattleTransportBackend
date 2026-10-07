const inspectorService = require("../service/inspector.service");

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
        const shift = await inspectorService.endShift(req.user.id);
        res.status(200).json({ success: true, message: "Shift ended", shift });
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

module.exports = {
    getDashboard,
    startShift,
    endShift,
    inspect
};
