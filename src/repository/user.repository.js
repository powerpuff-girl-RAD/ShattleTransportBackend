const { sql, getPool } = require("../config/database");


// GET ALL
const getAll = async () => {
    const pool = await getPool();
    const result = await pool
        .request()
        .execute("sp_Users_GetAll");
    return result.recordset;
};


// UPDATE
const update = async (id, { email, fullName, role, status }) => {
    const pool = await getPool();
    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .input("Email", sql.NVarChar, email)
        .input("FullName", sql.NVarChar, fullName || null)
        .input("Role", sql.NVarChar, role || null)
        .input("Status", sql.NVarChar, status || null)
        .execute("sp_Users_Update");
    return result.recordset[0] || null;
};


// DELETE
const remove = async (id) => {
    const pool = await getPool();
    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .execute("sp_Users_Delete");
};


module.exports = {
    getAll,
    update,
    remove
};
