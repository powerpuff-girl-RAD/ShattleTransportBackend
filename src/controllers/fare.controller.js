const fareService = require("../service/fare.service");

const getAll = async (req, res, next) => {
    try {
        const fares = await fareService.getAll(req.query.routeId);

        res.status(200).json({
            success: true,
            data: fares
        });
    } catch (error) {
        next(error);
    }
};

const create = async (req, res, next) => {
    try {
        const fare = await fareService.create(req.body);

        res.status(201).json({
            success: true,
            message: "Fare saved successfully",
            data: fare
        });
    } catch (error) {
        next(error);
    }
};

const update = async (req, res, next) => {
    try {
        const fare = await fareService.update(req.params.id, req.body);

        res.status(200).json({
            success: true,
            message: "Fare updated successfully",
            data: fare
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAll,
    create,
    update
};