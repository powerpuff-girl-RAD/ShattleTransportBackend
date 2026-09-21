const { sql, getPool } = require("../config/database");


// GET ALL
const getAll = async () => {

    const pool = await getPool();

    const result = await pool
        .request()
        .execute("sp_Health_GetAll");

    return result.recordset;
};


// GET BY ID
const getById = async (id) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .execute("sp_Health_GetById");

    return result.recordset[0] || null;
};


// CREATE
const create = async (data) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input(
            "PatientName",
            sql.NVarChar(100),
            data.patientName
        )
        .input(
            "Status",
            sql.NVarChar(50),
            data.status
        )
        .input(
            "Description",
            sql.NVarChar(500),
            data.description || null
        )
        .execute("sp_Health_Create");

    return result.recordset[0];
};


// UPDATE
const update = async (id, data) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .input(
            "PatientName",
            sql.NVarChar(100),
            data.patientName
        )
        .input(
            "Status",
            sql.NVarChar(50),
            data.status
        )
        .input(
            "Description",
            sql.NVarChar(500),
            data.description || null
        )
        .execute("sp_Health_Update");

    return result.recordset[0] || null;
};


// DELETE
const remove = async (id) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .execute("sp_Health_Delete");

    return result.recordset[0];
};


module.exports = {
    getAll,
    getById,
    create,
    update,
    remove
};