const { sql, getPool } = require("../config/database");

const getAll = async (routeId) => {
    const pool = await getPool();

    const result = await pool
        .request()
        .input("RouteId", sql.Int, routeId)
        .execute("SPR_FareManagement");

    const [farePass = [], distanceFare = [], flatFare = [], timeBasedFare = []] = result.recordsets || [];

    return {
        farePass,
        distanceFare,
        flatFare,
        timeBasedFare
    };
};

const create = async ({ routeId, minkm, maxkm, standardFare, offPeakFare }) => {
    const pool = await getPool();

    const result = await pool
        .request()
        .input("RouteId", sql.Int, routeId)
        .input("Minkm", sql.Decimal(6, 2), minkm)
        .input("Maxkm", sql.Decimal(6, 2), maxkm)
        .input("StandardFare", sql.Decimal(10, 2), standardFare)
        .input("OffPeakFare", sql.Decimal(10, 2), offPeakFare)
        .execute("SPR_FareManagement_Insert");

    return result.recordset[0];
};

const createBundle = async (payload) => {
    const pool = await getPool();

    await pool
        .request()
        .input("Payload", sql.NVarChar(sql.MAX), JSON.stringify(payload))
        .execute("SP_FareManagement_BulkInsert");

    return getAll(payload.routeId);
};

const update = async (id, { routeId, minkm, maxkm, standardFare, offPeakFare }) => {
    const pool = await getPool();

    const result = await pool
        .request()
        .input("Id", sql.BigInt, id)
        .input("RouteId", sql.Int, routeId)
        .input("Minkm", sql.Decimal(6, 2), minkm)
        .input("Maxkm", sql.Decimal(6, 2), maxkm)
        .input("StandardFare", sql.Decimal(10, 2), standardFare)
        .input("OffPeakFare", sql.Decimal(10, 2), offPeakFare)
        .execute("SPR_FareManagement_Update");

    return result.recordset[0] || null;
};

module.exports = {
    getAll,
    create,
    createBundle,
    update
};