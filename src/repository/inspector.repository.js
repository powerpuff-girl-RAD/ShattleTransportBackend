const { getCollection, nextId, NO_ID } = require("../config/database");

const users = () => getCollection("users");
const schedules = () => getCollection("schedules");
const shifts = () => getCollection("inspectorShifts");
const inspections = () => getCollection("inspections");


// ─── Inspector profile ────────────────────────────────────────────────────

// Never return the password hash or refresh token (security: limit exposure)
const findInspectorById = async (id) => {
    return (await users()).findOne(
        { Id: Number(id), Deleted: { $ne: 1 } },
        { projection: { _id: 0, PasswordHash: 0, RefreshToken: 0 } }
    );
};


// ─── Assigned schedule (created by a manager in the web portal) ───────────

// The inspector's first schedule on the given "YYYY-MM-DD" date, with route and vehicle joined in
const findScheduleForDate = async (inspectorId, date) => {

    const rows = await (await schedules()).aggregate([
        { $match: { InspectorId: Number(inspectorId), Date: date, Deleted: { $ne: 1 } } },
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


// ─── Inspections (written by the Scan screen in Screen 2) ─────────────────

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


module.exports = {
    findInspectorById,
    findScheduleForDate,
    findOpenShift,
    createShift,
    closeShift,
    countInspectionsBetween,
    findRecentInspections
};
