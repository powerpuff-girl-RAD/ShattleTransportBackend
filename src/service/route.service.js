const routeRepository = require("../repository/route.repository");


// GET ALL (groups flat Route/Stop rows into nested route objects)
const getAllRoutes = async () => {

    const rows = await routeRepository.getAll();

    const routesById = new Map();

    for (const row of rows) {

        if (!routesById.has(row.RouteId)) {

            routesById.set(row.RouteId, {
                id: row.RouteId,
                routeNumber: row.RouteNumber,
                routeName: row.RouteName,
                startLocation: row.StartLocation,
                endLocation: row.EndLocation,
                distanceKm: row.RouteDistanceKm,
                currentStatus: row.CurrentStatus,
                stops: []
            });
        }

        routesById.get(row.RouteId).stops.push({
            id: row.StopId,
            name: row.StopName,
            order: row.StopOrder,
            distanceFromStartKm: row.DistanceFromStartKm
        });
    }

    return Array.from(routesById.values());
};


// CREATE
const createRoute = async (data) => {

    const { routeNumber, routeName, startLocation, endLocation, distanceKm, stops } = data;

    if (!routeNumber || !routeName || !startLocation || !endLocation || !distanceKm) {

        const error = new Error(
            "RouteNumber, RouteName, StartLocation, EndLocation and DistanceKm are required"
        );

        error.statusCode = 400;

        throw error;
    }

    if (!Array.isArray(stops) || stops.length === 0) {

        const error = new Error("At least one stop is required");

        error.statusCode = 400;

        throw error;
    }

    for (const stop of stops) {

        if (!stop.stopName || stop.stopOrder === undefined || stop.distanceFromStartKm === undefined) {

            const error = new Error(
                "Each stop requires stopName, stopOrder and distanceFromStartKm"
            );

            error.statusCode = 400;

            throw error;
        }
    }

    return await routeRepository.create({
        routeNumber,
        routeName,
        startLocation,
        endLocation,
        distanceKm,
        stops
    });
};


// UPDATE
const updateRoute = async (id, data) => {

    const { routeNumber, routeName, startLocation, endLocation, distanceKm, stops } = data;

    if (!routeNumber || !routeName || !startLocation || !endLocation || !distanceKm) {

        const error = new Error(
            "RouteNumber, RouteName, StartLocation, EndLocation and DistanceKm are required"
        );

        error.statusCode = 400;

        throw error;
    }

    if (!Array.isArray(stops) || stops.length === 0) {

        const error = new Error("At least one stop is required");

        error.statusCode = 400;

        throw error;
    }

    for (const stop of stops) {

        if (!stop.stopName || stop.stopOrder === undefined || stop.distanceFromStartKm === undefined) {

            const error = new Error(
                "Each stop requires stopName, stopOrder and distanceFromStartKm"
            );

            error.statusCode = 400;

            throw error;
        }
    }

    const route = await routeRepository.update(id, {
        routeNumber,
        routeName,
        startLocation,
        endLocation,
        distanceKm,
        stops
    });

    if (!route) {

        const error = new Error("Route not found");

        error.statusCode = 404;

        throw error;
    }

    return route;
};


// UPDATE STATUS ONLY
const updateRouteStatus = async (id, currentStatus) => {

    if (typeof currentStatus !== "boolean") {

        const error = new Error("CurrentStatus is required and must be a boolean");

        error.statusCode = 400;

        throw error;
    }

    const route = await routeRepository.updateStatus(id, currentStatus);

    if (!route) {

        const error = new Error("Route not found");

        error.statusCode = 404;

        throw error;
    }

    return route;
};


module.exports = {
    getAllRoutes,
    createRoute,
    updateRoute,
    updateRouteStatus
};
