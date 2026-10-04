const routeRepository = require("../repository/route.repository");
const RouteBuilder = require("../builders/route.builder");
const { badRequest, notFound } = require("../utils/errors");


const validateRoute = (data) => {

    const { routeNumber, routeName, startLocation, endLocation, distanceKm, stops } = data;

    if (!routeNumber || !routeName || !startLocation || !endLocation || !distanceKm) {

        throw badRequest("RouteNumber, RouteName, StartLocation, EndLocation and DistanceKm are required");
    }

    if (!Array.isArray(stops) || stops.length === 0) {

        throw badRequest("At least one stop is required");
    }

    for (const stop of stops) {

        if (!stop.stopName || stop.stopOrder === undefined || stop.distanceFromStartKm === undefined) {

            throw badRequest("Each stop requires stopName, stopOrder and distanceFromStartKm");
        }
    }

    return { routeNumber, routeName, startLocation, endLocation, distanceKm, stops };
};


// GET ALL (groups flat Route/Stop rows into nested route objects)
const getAllRoutes = async () => {

    return RouteBuilder.fromRows(await routeRepository.getAll());
};


// CREATE
const createRoute = async (data) => {

    return await routeRepository.create(validateRoute(data));
};


// UPDATE
const updateRoute = async (id, data) => {

    const route = await routeRepository.update(id, validateRoute(data));

    if (!route) {

        throw notFound("Route not found");
    }

    return route;
};


// UPDATE STATUS ONLY
const updateRouteStatus = async (id, currentStatus) => {

    if (typeof currentStatus !== "boolean") {

        throw badRequest("CurrentStatus is required and must be a boolean");
    }

    const route = await routeRepository.updateStatus(id, currentStatus);

    if (!route) {

        throw notFound("Route not found");
    }

    return route;
};


module.exports = {
    getAllRoutes,
    createRoute,
    updateRoute,
    updateRouteStatus
};
