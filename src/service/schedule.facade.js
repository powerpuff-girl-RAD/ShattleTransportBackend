const QRCode = require("qrcode");
const scheduleRepository = require("../repository/schedule.repository");
const routeRepository = require("../repository/route.repository");
const vehicleRepository = require("../repository/vehicle.repository");
const QrPayloadBuilder = require("../builders/qrPayload.builder");
const { badRequest, notFound } = require("../utils/errors");


// Facade: one entry point that coordinates route, vehicle, schedule and QR generation
const validateInput = ({ date, startTime, endTime, routeId, vehicleId, inspectorId, status }) => {

    if (!date || !startTime || !endTime || !routeId || !vehicleId || !inspectorId || !status) {

        throw badRequest(
            "Date, StartTime, EndTime, RouteId, VehicleId, InspectorId and Status are required"
        );
    }
};

const ensureRouteAndVehicleExist = async (routeId, vehicleId) => {

    const [routeRows, vehicleRows] = await Promise.all([
        routeRepository.getByRouteId(routeId),
        vehicleRepository.getbyId(vehicleId)
    ]);

    if (!routeRows || routeRows.length === 0) {

        throw notFound("Route not found");
    }

    if (!vehicleRows || vehicleRows.length === 0) {

        throw notFound("Vehicle not found");
    }
};

// QR encodes human-readable text; names come from the stored schedule row
const generateQrCode = async (scheduleId, { date, startTime, endTime, status }) => {

    const [row] = await scheduleRepository.getbyId(scheduleId);

    const text = new QrPayloadBuilder()
        .withSchedule(scheduleId)
        .withRoute(row?.RouteName)
        .withVehicle(row?.VehicleName)
        .withInspector(row?.Inspector)
        .withDate(date)
        .withTime(startTime, endTime)
        .withStatus(status)
        .build();

    return QRCode.toDataURL(text);
};

const assign = async (data) => {

    validateInput(data);

    await ensureRouteAndVehicleExist(data.routeId, data.vehicleId);

    const scheduleId = await scheduleRepository.create(data);

    const qrCode = await generateQrCode(scheduleId, data);

    return await scheduleRepository.saveQrCode(scheduleId, qrCode);
};

const update = async (id, data) => {

    validateInput(data);

    await ensureRouteAndVehicleExist(data.routeId, data.vehicleId);

    const schedule = await scheduleRepository.update(id, data);

    if (!schedule || schedule.length === 0) {

        throw notFound("Schedule not found");
    }

    const qrCode = await generateQrCode(id, data);

    return await scheduleRepository.saveQrCode(id, qrCode);
};

module.exports = {
    assign,
    update
};
