const QRCode = require("qrcode");
const scheduleRepository = require("../repository/schedule.repository");


// QR encodes human-readable text; names come from the stored schedule row
const buildQrCode = async (scheduleId, { date, startTime, endTime, status }) => {

    const [row] = await scheduleRepository.getbyId(scheduleId);

    const text = [
        "SHATTLE TRIP",
        `Schedule #: ${scheduleId}`,
        `Route: ${row?.RouteName ?? "-"}`,
        `Vehicle: ${row?.VehicleName ?? "-"}`,
        `Inspector: ${row?.Inspector || "-"}`,
        `Date: ${date}`,
        `Time: ${startTime} - ${endTime}`,
        `Status: ${status}`
    ].join("\n");

    return QRCode.toDataURL(text);
};


const getAllSchedules = async () => {

    return await scheduleRepository.getAll();
};

const getScheduleById = async (id) => {

    const schedule = await scheduleRepository.getbyId(id);

    if (!schedule || schedule.length === 0) {

        const error = new Error("Schedule not found");

        error.statusCode = 404;

        throw error;
    }

    return schedule[0];
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

    const scheduleId = await scheduleRepository.create({
        date,
        startTime,
        endTime,
        routeId,
        vehicleId,
        inspectorId,
        status
    });

    const qrCode = await buildQrCode(scheduleId, { date, startTime, endTime, status });

    return await scheduleRepository.saveQrCode(scheduleId, qrCode);
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

    if (!schedule || schedule.length === 0) {

        const error = new Error("Schedule not found");

        error.statusCode = 404;

        throw error;
    }

    const qrCode = await buildQrCode(id, { date, startTime, endTime, status });

    return await scheduleRepository.saveQrCode(id, qrCode);
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
    getScheduleById,
    assignSchedule,
    updateSchedule,
    removeSchedule
};
