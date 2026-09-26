const { sql, getPool } = require("../config/database");


// GET ALL (flat rows, one per route/stop pair)
const getAll = async () => {

    const pool = await getPool();

    const result = await pool
        .request()
        .execute("SPR_Routes");

    return result.recordset;
};

const getByRouteId = async (routeId) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("RouteId", sql.BigInt, routeId)
        .execute("SPR_Routes");

    return result.recordset;
};

// CREATE (route + stops in one transaction)
const create = async ({ routeNumber, routeName, startLocation, endLocation, distanceKm, stops }) => {

    const pool = await getPool();

    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {

        const routeResult = await new sql.Request(transaction)
            .input("RouteNumber", sql.NVarChar(50), routeNumber)
            .input("RouteName", sql.NVarChar(100), routeName)
            .input("StartLocation", sql.NVarChar(200), startLocation)
            .input("EndLocation", sql.NVarChar(200), endLocation)
            .input("DistanceKm", sql.Decimal(10, 2), distanceKm)
            .execute("sp_Routes_Create");

        const route = routeResult.recordset[0];

        for (const stop of stops) {

            await new sql.Request(transaction)
                .input("RouteId", sql.Int, route.Id)
                .input("StopName", sql.NVarChar(200), stop.stopName)
                .input("StopOrder", sql.Int, stop.stopOrder)
                .input("DistanceFromStartKm", sql.Decimal(10, 2), stop.distanceFromStartKm)
                .execute("sp_RouteStops_Create");
        }

        await transaction.commit();

        return route;

    } catch (error) {

        await transaction.rollback();

        throw error;
    }
};


// UPDATE (route fields + replaces stops in one transaction)
const update = async (id, { routeNumber, routeName, startLocation, endLocation, distanceKm, stops }) => {

    const pool = await getPool();

    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {

        const routeResult = await new sql.Request(transaction)
            .input("Id", sql.Int, id)
            .input("RouteNumber", sql.NVarChar(50), routeNumber)
            .input("RouteName", sql.NVarChar(100), routeName)
            .input("StartLocation", sql.NVarChar(200), startLocation)
            .input("EndLocation", sql.NVarChar(200), endLocation)
            .input("DistanceKm", sql.Decimal(10, 2), distanceKm)
            .execute("sp_Routes_Update");

        const route = routeResult.recordset[0] || null;

        if (!route) {
            await transaction.rollback();
            return null;
        }
        await new sql.Request(transaction)
            .input(
                "RouteId",
                sql.Int,
                id
            )
            .input(
                "Stops",
                sql.NVarChar(sql.MAX),
                JSON.stringify(stops)
            )
            .execute("sp_RouteStops_Sync");
        await transaction.commit();
        return getByRouteId(id);

    } catch (error) {

        await transaction.rollback();

        throw error;
    }
};


// UPDATE STATUS ONLY
const updateStatus = async (id, currentStatus) => {

    const pool = await getPool();

    const result = await pool
        .request()
        .input("Id", sql.Int, id)
        .input("CurrentStatus", sql.Bit, currentStatus)
        .execute("sp_Routes_UpdateStatus");
    return getByRouteId(id);
};


module.exports = {
    getAll,
    getByRouteId,
    create,
    update,
    updateStatus
};
