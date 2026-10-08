const { getCollection, nextId, NO_ID } = require("../config/database");

const users = () => getCollection("users");
const schedules = () => getCollection("schedules");
const shifts = () => getCollection("inspectorShifts");
const inspections = () => getCollection("inspections");
const violations = () => getCollection("violations");

// Group statistics by the server's calendar day (the same days the service's
// date ranges use), not by UTC day
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;


// ─── Inspector profile ────────────────────────────────────────────────────

// Never return the password hash or refresh token (security: limit exposure)
const findInspectorById = async (id) => {
    return (await users()).findOne(
        { Id: Number(id), Deleted: { $ne: 1 } },
        { projection: { _id: 0, PasswordHash: 0, RefreshToken: 0 } }
    );
};


// ─── Assigned schedule (created by a manager in the web portal) ───────────

// One schedule matching the filter, with route and vehicle joined in
const findSchedule = async (match) => {

    const rows = await (await schedules()).aggregate([
        { $match: { ...match, Deleted: { $ne: 1 } } },
        { $sort: { StartTime: 1 } },
        { $limit: 1 },
        { $lookup: { from: "routes", localField: "RouteId", foreignField: "Id", as: "route" } },
        { $lookup: { from: "vehicles", localField: "VehicleId", foreignField: "Id", as: "vehicle" } },
        {
            $addFields: {
                RouteNumber: { $first: "$route.RouteNumber" },
                RouteName: { $first: "$route.RouteName" },
                VehicleNumber: { $ifNull: [{ $first: "$vehicle.VehicleId" }, { $first: "$vehicle.Name" }] }
            }
        },
        { $project: { _id: 0, route: 0, vehicle: 0, QrCode: 0 } }
    ]).toArray();

    return rows[0] || null;
};

// The inspector's first schedule on the given "YYYY-MM-DD" date
const findScheduleForDate = (inspectorId, date) => {
    return findSchedule({ InspectorId: Number(inspectorId), Date: date });
};

const findScheduleById = (scheduleId) => {
    return findSchedule({ Id: Number(scheduleId) });
};


// ─── Shifts (actual start / end times = audit trail) ──────────────────────

// An open shift is one that has started but not ended yet
const findOpenShift = async (inspectorId) => {
    return (await shifts()).findOne({ InspectorId: Number(inspectorId), EndedAt: null }, NO_ID);
};

const createShift = async (inspectorId, scheduleId) => {

    const shift = {
        Id: await nextId("inspectorShifts"),
        InspectorId: Number(inspectorId),
        ScheduleId: Number(scheduleId),
        StartedAt: new Date(),
        EndedAt: null
    };

    // Insert a copy: insertOne adds _id to the object it receives
    await (await shifts()).insertOne({ ...shift });

    return shift;
};

const closeShift = async (shiftId) => {
    return (await shifts()).findOneAndUpdate(
        { Id: Number(shiftId) },
        { $set: { EndedAt: new Date() } },
        { ...NO_ID, returnDocument: "after" }
    );
};


// ─── Inspections ──────────────────────────────────────────────────────────

const createInspection = async (data) => {

    const inspection = {
        Id: await nextId("inspections"),
        ...data,
        InspectedAt: new Date()
    };

    await (await inspections()).insertOne({ ...inspection });

    return inspection;
};

// result is optional: pass "Valid" to count only valid inspections
const countInspectionsBetween = async (inspectorId, from, to, result) => {

    const filter = { InspectorId: Number(inspectorId), InspectedAt: { $gte: from, $lt: to } };

    if (result) {
        filter.Result = result;
    }

    return (await inspections()).countDocuments(filter);
};

const findRecentInspections = async (inspectorId, limit = 3) => {
    return (await inspections())
        .find({ InspectorId: Number(inspectorId) }, NO_ID)
        .sort({ InspectedAt: -1 })
        .limit(limit)
        .toArray();
};

// History screen: filter is built by the service (date range, route, bus, result)
const findInspections = async (filter, limit = 200) => {
    return (await inspections())
        .find(filter, NO_ID)
        .sort({ InspectedAt: -1 })
        .limit(limit)
        .toArray();
};

// An inspector may only open their own inspections (security: authorize)
const findInspectionById = async (inspectorId, inspectionId) => {
    return (await inspections()).findOne(
        { Id: Number(inspectionId), InspectorId: Number(inspectorId) },
        NO_ID
    );
};

// Options for the History filter chips: every route / bus this inspector has worked on
const findInspectionFilterOptions = async (inspectorId) => {

    const collection = await inspections();
    const filter = { InspectorId: Number(inspectorId) };

    const [routes, buses] = await Promise.all([
        collection.distinct("RouteNumber", filter),
        collection.distinct("VehicleNumber", filter)
    ]);

    return { routes: routes.filter(Boolean).sort(), buses: buses.filter(Boolean).sort() };
};

const setInspectionViolation = async (inspectionId, violationId) => {
    await (await inspections()).updateOne(
        { Id: Number(inspectionId) },
        { $set: { ViolationId: violationId } }
    );
};


// ─── Violations ───────────────────────────────────────────────────────────

const createViolation = async (data) => {

    const violation = {
        Id: await nextId("violations"),
        ...data,
        RecordedAt: new Date()
    };

    await (await violations()).insertOne({ ...violation });

    return violation;
};

const findViolationByInspectionId = async (inspectionId) => {
    return (await violations()).findOne({ InspectionId: Number(inspectionId) }, NO_ID);
};

const findViolations = async (inspectorId, limit = 200) => {
    return (await violations())
        .find({ InspectorId: Number(inspectorId) }, NO_ID)
        .sort({ RecordedAt: -1 })
        .limit(limit)
        .toArray();
};


// ─── Statistics (Statistics screen + manager report) ──────────────────────

// match is a Mongo filter on inspections, e.g. { InspectorId: 3, InspectedAt: {...} }.
// One aggregation, several "facets" = several groupings in a single database round trip.
const aggregateInspectionStats = async (match) => {

    const rows = await (await inspections()).aggregate([
        { $match: match },
        {
            $facet: {
                totals: [
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            invalid: { $sum: { $cond: [{ $eq: ["$Result", "Invalid"] }, 1, 0] } }
                        }
                    }
                ],
                byReason: [
                    { $match: { Result: "Invalid" } },
                    { $group: { _id: "$Reason", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                byRoute: [
                    {
                        $group: {
                            _id: { routeNumber: "$RouteNumber", routeName: "$RouteName" },
                            total: { $sum: 1 },
                            invalid: { $sum: { $cond: [{ $eq: ["$Result", "Invalid"] }, 1, 0] } }
                        }
                    },
                    { $sort: { invalid: -1, total: -1 } }
                ],
                byDay: [
                    {
                        $group: {
                            _id: { $dateToString: { format: "%Y-%m-%d", date: "$InspectedAt", timezone: TIMEZONE } },
                            total: { $sum: 1 },
                            invalid: { $sum: { $cond: [{ $eq: ["$Result", "Invalid"] }, 1, 0] } }
                        }
                    },
                    { $sort: { _id: 1 } }
                ],
                byInspector: [
                    {
                        $group: {
                            _id: "$InspectorId",
                            total: { $sum: 1 },
                            invalid: { $sum: { $cond: [{ $eq: ["$Result", "Invalid"] }, 1, 0] } }
                        }
                    },
                    { $lookup: { from: "users", localField: "_id", foreignField: "Id", as: "inspector" } },
                    { $addFields: { name: { $first: "$inspector.FullName" } } },
                    { $project: { inspector: 0 } },
                    { $sort: { invalid: -1 } }
                ]
            }
        }
    ]).toArray();

    return rows[0];
};


// ─── Password ─────────────────────────────────────────────────────────────

// Only the hash, and only for the password check in the service
const findPasswordHash = async (id) => {
    const user = await (await users()).findOne(
        { Id: Number(id), Deleted: { $ne: 1 } },
        { projection: { _id: 0, PasswordHash: 1 } }
    );
    return user ? user.PasswordHash : null;
};

const updatePasswordHash = async (id, passwordHash) => {
    await (await users()).updateOne({ Id: Number(id) }, { $set: { PasswordHash: passwordHash } });
};


// ─── Upcoming schedule (Shift Schedule screen) ────────────────────────────

// Dates are "YYYY-MM-DD" strings, so string comparison gives date order
const findUpcomingSchedules = async (inspectorId, fromDate, limit = 14) => {

    return (await schedules()).aggregate([
        { $match: { InspectorId: Number(inspectorId), Date: { $gte: fromDate }, Deleted: { $ne: 1 } } },
        { $sort: { Date: 1, StartTime: 1 } },
        { $limit: limit },
        { $lookup: { from: "routes", localField: "RouteId", foreignField: "Id", as: "route" } },
        { $lookup: { from: "vehicles", localField: "VehicleId", foreignField: "Id", as: "vehicle" } },
        {
            $addFields: {
                RouteNumber: { $first: "$route.RouteNumber" },
                RouteName: { $first: "$route.RouteName" },
                VehicleNumber: { $ifNull: [{ $first: "$vehicle.VehicleId" }, { $first: "$vehicle.Name" }] }
            }
        },
        { $project: { _id: 0, route: 0, vehicle: 0, QrCode: 0 } }
    ]).toArray();
};


module.exports = {
    findInspectorById,
    findScheduleForDate,
    findScheduleById,
    findUpcomingSchedules,
    findOpenShift,
    createShift,
    closeShift,
    createInspection,
    countInspectionsBetween,
    findRecentInspections,
    findInspections,
    findInspectionById,
    findInspectionFilterOptions,
    setInspectionViolation,
    createViolation,
    findViolationByInspectionId,
    findViolations,
    aggregateInspectionStats,
    findPasswordHash,
    updatePasswordHash
};
