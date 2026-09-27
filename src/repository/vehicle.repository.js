const { sql, getPool } = require("../config/database");


const getAll = async () => {
    return getVehicle(-1);
};

const getbyId = async (id) => {
    return getVehicle(id);
};

const getVehicle = async (id) => {
    const pool = await getPool();
    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .execute("sp_Vehicles_Get");
    return result.recordset;
};


const create = async ({ depot, name, status, type, vehicleId }) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("Depot", sql.NVarChar(100), depot)
        .input("Name", sql.NVarChar(100), name)
        .input("Status", sql.NVarChar(10), status)
        .input("Type", sql.Int, type)
        .input("VehicleId", sql.NVarChar(50), vehicleId)
        .execute("sp_Vehicles_Create");

    return getbyId(result.recordset[0].Id);
};


const update = async (id, { depot, name, status, type, vehicleId }) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .input("Depot", sql.NVarChar(100), depot)
        .input("Name", sql.NVarChar(100), name)
        .input("Status", sql.NVarChar(10), status)
        .input("Type", sql.Int, type)
        .input("VehicleId", sql.NVarChar(50), vehicleId)
        .execute("sp_Vehicles_Update");

    return getbyId(id);
};


const remove = async (id) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .execute("sp_Vehicles_Delete");

    return result.recordset[0] || null;
};


module.exports = {
    getAll,
    getbyId,
    create,
    update,
    remove
};