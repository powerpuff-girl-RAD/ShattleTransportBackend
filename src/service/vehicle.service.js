const vehicleRepository = require("../repository/vehicle.repository");


const getAllVehicles = async () => {

    return await vehicleRepository.getAll();
};


const createVehicle = async ({ depot, name, status, type, vehicleId, seat }) => {

    if (!depot || !name || !status || !type || !vehicleId || !seat) {

        const error = new Error(
            "Depot, Name, Status, Type, VehicleId and Seat are required"
        );

        error.statusCode = 400;

        throw error;
    }

    return await vehicleRepository.create({
        depot,
        name,
        status,
        type,
        vehicleId,
        seat
    });
};


const updateVehicle = async (id, { depot, name, status, type, vehicleId, seats }) => {

    if (!depot || !name || !status || !type || !vehicleId || !seats) {

        const error = new Error(
            "Depot, Name, Status, Type, VehicleId and Seat are required"
        );

        error.statusCode = 400;

        throw error;
    }

    const vehicle = await vehicleRepository.update(id, {
        depot,
        name,
        status,
        type,
        vehicleId,
        seats
    });

    if (!vehicle) {

        const error = new Error("Vehicle not found");

        error.statusCode = 404;

        throw error;
    }

    return vehicle;
};


const deleteVehicle = async (id) => {

    const vehicle = await vehicleRepository.remove(id);

    if (!vehicle) {

        const error = new Error("Vehicle not found");

        error.statusCode = 404;

        throw error;
    }
};


module.exports = {
    getAllVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle
};