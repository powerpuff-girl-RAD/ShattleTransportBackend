const { sql, getPool } = require("../config/database");

const findByEmail = async (email) => {
    const pool = await getPool();

    const result = await pool.request()
        .input("Email", sql.NVarChar, email)
        .execute("sp_FindUserByEmail");

    return result.recordset[0];
};

const findById = async (id) => {
    const pool = await getPool();

    const result = await pool.request()
        .input("Id", sql.Int, id)
        .execute("sp_FindUserById");

    return result.recordset[0];
};

const createUser = async ({ email, passwordHash, fullName, role }) => {
    const pool = await getPool();

    const result = await pool.request()
        .input("Email", sql.NVarChar, email)
        .input("PasswordHash", sql.NVarChar, passwordHash)
        .input("FullName", sql.NVarChar, fullName || null)
        .input("Role", sql.NVarChar, role || null)
        .execute("sp_CreateUser");

    return result.recordset[0];
};

const updateRefreshToken = async (id, refreshToken) => {
    const pool = await getPool();

    await pool.request()
        .input("Id", sql.Int, id)
        .input("RefreshToken", sql.NVarChar, refreshToken)
        .execute("sp_UpdateRefreshToken");
};

module.exports = {
    findByEmail,
    findById,
    createUser,
    updateRefreshToken
};