const vehicleService = require("../service/vehicle.service");


// GET /api/vehicles
const getAll = async (req, res, next) => {

    try {

        const vehicles = await vehicleService.getAllVehicles();

        res.status(200).json({
            success: true,
            data: vehicles
        });

    } catch (error) {

        next(error);
    }
};


// POST /api/vehicles
const create = async (req, res, next) => {

    try {

        const vehicle = await vehicleService.createVehicle(req.body);

        res.status(201).json({
            success: true,
            message: "Vehicle created successfully",
            data: vehicle
        });

    } catch (error) {

        next(error);
    }
};


// PUT /api/vehicles/:id
const update = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        const vehicle = await vehicleService.updateVehicle(id, req.body);

        res.status(200).json({
            success: true,
            message: "Vehicle updated successfully",
            data: vehicle
        });

    } catch (error) {

        next(error);
    }
};


// DELETE /api/vehicles/:id
const remove = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        await vehicleService.deleteVehicle(id);

        res.status(200).json({
            success: true,
            message: "Vehicle deleted successfully"
        });

    } catch (error) {

        next(error);
    }
};


module.exports = {
    getAll,
    create,
    update,
    remove
};