const { sql, getPool } = require("../config/database");


const getAll = async () => {
    return getSchedule(-1);
};

const getbyId = async (id) => {
    return getSchedule(id);
};

const getSchedule = async (id) => {
    const pool = await getPool();
    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .execute("sp_Schedules_Get");
    return result.recordset;
};


// CREATE (assign a schedule)
const create = async ({ date, startTime, endTime, routeId, vehicleId, inspectorId, status }) => {

    const pool = await getPool();
    const startTimeValue = new Date(`1970-01-01T${startTime}:00Z`);
    const endTimeValue   = new Date(`1970-01-01T${endTime}:00Z`);
    const result = await pool
        .request()
        .input("Date", sql.Date, date)
        .input("StartTime", sql.Time(7), startTimeValue)
        .input("EndTime", sql.Time(7), endTimeValue)
        .input("RouteId", sql.Int, routeId)
        .input("VehicleId", sql.Int, vehicleId)
        .input("InspectorId", sql.Int, inspectorId)
        .input("Status", sql.NVarChar(20), status)
        .execute("sp_VehicleSchedules_Create");

    return result.recordset[0].AssignmentId;
};

const saveQrCode = async (id, qrCode) => {

    const pool = await getPool();
    await pool
        .request()
        .input("Id", sql.BigInt, id)
        .input("QrCode", sql.NVarChar(sql.MAX), qrCode)
        .execute("sp_VehicleSchedules_SaveQrCode");

    return getbyId(id);
};


const update = async (id, { date, startTime, endTime, routeId, vehicleId, inspectorId, status }) => {

    const pool = await getPool();
    const startTimeValue = new Date(`1970-01-01T${startTime}:00Z`);
    const endTimeValue   = new Date(`1970-01-01T${endTime}:00Z`);
    await pool
        .request()
        .input("Id", sql.Int, id)
        .input("Date", sql.Date, date)
        .input("StartTime", sql.Time(7), startTimeValue)
        .input("EndTime", sql.Time(7), endTimeValue)
        .input("RouteId", sql.Int, routeId)
        .input("VehicleId", sql.Int, vehicleId)
        .input("InspectorId", sql.Int, inspectorId)
        .input("Status", sql.NVarChar(20), status)
        .execute("sp_Schedules_Update");

    return getbyId(id);
};


const remove = async (id) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .execute("sp_Schedules_Delete");

    return result.recordset[0] || null;
};


module.exports = {
    getAll,
    getbyId,
    create,
    saveQrCode,
    update,
    remove
};
