const vehicleRepository = require("../repository/vehicle.repository");
const { badRequest, notFound } = require("../utils/errors");


const getAllVehicles = async () => {

    return await vehicleRepository.getAll();
};


const createVehicle = async ({ depot, name, status, type, vehicleId, seats }) => {

    if (!depot || !name || !status || !type || !vehicleId || !seats) {

        throw badRequest("Depot, Name, Status, Type, VehicleId and Seat are required");
    }

    return await vehicleRepository.create({
        depot,
        name,
        status,
        type,
        vehicleId,
        seats
    });
};


const updateVehicle = async (id, { depot, name, status, type, vehicleId, seats, seat }) => {

    seats = seats ?? seat;

    if (!depot || !name || !status || !type || !vehicleId || !seats) {

        throw badRequest("Depot, Name, Status, Type, VehicleId and Seat are required");
    }

    const vehicle = await vehicleRepository.update(id, {
        depot,
        name,
        status,
        type,
        vehicleId,
        seats
    });

    if (!vehicle || vehicle.length === 0) {

        throw notFound("Vehicle not found");
    }

    return vehicle;
};


const deleteVehicle = async (id) => {

    const vehicle = await vehicleRepository.remove(id);

    if (!vehicle) {

        throw notFound("Vehicle not found");
    }
};


module.exports = {
    getAllVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle
};