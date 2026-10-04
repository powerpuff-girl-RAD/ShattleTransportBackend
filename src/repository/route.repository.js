const { getCollection, nextId, NO_ID } = require("../config/database");

const routes = () => getCollection("routes");

// Flattens a route document into one row per stop (the shape the route builder expects)
const toRows = (route) => {
    const stops = [...(route.stops || [])].sort((a, b) => a.StopOrder - b.StopOrder);

    return stops.map((stop) => ({
        RouteId: route.Id,
        RouteNumber: route.RouteNumber,
        RouteName: route.RouteName,
        StartLocation: route.StartLocation,
        EndLocation: route.EndLocation,
        RouteDistanceKm: route.DistanceKm,
        CurrentStatus: route.CurrentStatus,
        StopId: stop.Id,
        StopName: stop.StopName,
        StopOrder: stop.StopOrder,
        DistanceFromStartKm: stop.DistanceFromStartKm
    }));
};

const buildStops = async (stops) => {
    const built = [];

    for (const stop of stops) {
        built.push({
            Id: await nextId("routeStops"),
            StopName: stop.stopName,
            StopOrder: Number(stop.stopOrder),
            DistanceFromStartKm: Number(stop.distanceFromStartKm)
        });
    }

    return built;
};

const toSummary = ({ stops, ...route }) => route;


// GET ALL (flat rows, one per route/stop pair)
const getAll = async () => {

    const docs = await (await routes()).find({ Deleted: { $ne: 1 } }, NO_ID).sort({ Id: 1 }).toArray();

    return docs.flatMap(toRows);
};

const getByRouteId = async (routeId) => {

    const doc = await (await routes()).findOne({ Id: Number(routeId), Deleted: { $ne: 1 } }, NO_ID);

    return doc ? toRows(doc) : [];
};

// CREATE (route and stops live in one document, so the write is atomic)
const create = async ({ routeNumber, routeName, startLocation, endLocation, distanceKm, stops }) => {

    const route = {
        Id: await nextId("routes"),
        RouteNumber: routeNumber,
        RouteName: routeName,
        StartLocation: startLocation,
        EndLocation: endLocation,
        DistanceKm: Number(distanceKm),
        CurrentStatus: true,
        stops: await buildStops(stops),
        CreatedAt: new Date()
    };

    await (await routes()).insertOne({ ...route });

    return toSummary(route);
};


// UPDATE (route fields + replaces stops)
const update = async (id, { routeNumber, routeName, startLocation, endLocation, distanceKm, stops }) => {

    const result = await (await routes()).updateOne(
        { Id: Number(id), Deleted: { $ne: 1 } },
        {
            $set: {
                RouteNumber: routeNumber,
                RouteName: routeName,
                StartLocation: startLocation,
                EndLocation: endLocation,
                DistanceKm: Number(distanceKm),
                stops: await buildStops(stops)
            }
        }
    );

    if (result.matchedCount === 0) {
        return null;
    }

    return getByRouteId(id);
};


// UPDATE STATUS ONLY
const updateStatus = async (id, currentStatus) => {

    await (await routes()).updateOne({ Id: Number(id), Deleted: { $ne: 1 } }, { $set: { CurrentStatus: currentStatus } });

    return getByRouteId(id);
};


module.exports = {
    getAll,
    getByRouteId,
    create,
    update,
    updateStatus
};
