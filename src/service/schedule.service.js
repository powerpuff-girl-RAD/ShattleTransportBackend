const scheduleRepository = require("../repository/schedule.repository");


const getAllSchedules = async () => {

    return await scheduleRepository.getAll();
};


// ASSIGN (create)
const assignSchedule = async ({ date, startTime, endTime, routeId, vehicleId, inspectorId, status }) => {

    if (!date || !startTime || !endTime || !routeId || !vehicleId || !inspectorId || !status) {

        const error = new Error(
            "Date, StartTime, EndTime, RouteId, VehicleId, InspectorId and Status are required"
        );

        error.statusCode = 400;

        throw error;
    }

    return await scheduleRepository.create({
        date,
        startTime,
        endTime,
        routeId,
        vehicleId,
        inspectorId,
        status
    });
};


const updateSchedule = async (id, { date, startTime, endTime, routeId, vehicleId, inspectorId, status }) => {

    if (!date || !startTime || !endTime || !routeId || !vehicleId || !inspectorId || !status) {

        const error = new Error(
            "Date, StartTime, EndTime, RouteId, VehicleId, InspectorId and Status are required"
        );

        error.statusCode = 400;

        throw error;
    }

    const schedule = await scheduleRepository.update(id, {
        date,
        startTime,
        endTime,
        routeId,
        vehicleId,
        inspectorId,
        status
    });

    if (!schedule) {

        const error = new Error("Schedule not found");

        error.statusCode = 404;

        throw error;
    }

    return schedule;
};


const removeSchedule = async (id) => {

    const schedule = await scheduleRepository.remove(id);

    if (!schedule) {

        const error = new Error("Schedule not found");

        error.statusCode = 404;

        throw error;
    }
};


module.exports = {
    getAllSchedules,
    assignSchedule,
    updateSchedule,
    removeSchedule
};
