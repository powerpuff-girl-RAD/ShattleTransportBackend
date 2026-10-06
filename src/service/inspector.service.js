const inspectorRepository = require("../repository/inspector.repository");
const { notFound, conflict } = require("../utils/errors");


// ─── Helpers ──────────────────────────────────────────────────────────────

// Schedules store the date as a "YYYY-MM-DD" string (HTML date input format)
const todayString = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// From the start of today up to (not including) the start of tomorrow, in server time
const todayRange = () => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return { from, to };
};


// ─── Mappers: database rows (PascalCase) → API shape (camelCase) ─────────
// Information hiding (Lecture 7): the mobile app never sees raw DB field names

const toProfile = (user) => ({
    id: user.Id,
    name: user.FullName || user.Email,
    email: user.Email,
    badge: `INS-${String(user.Id).padStart(4, "0")}`
});

const toShift = (schedule, openShift) => {

    if (!schedule) {
        return null;
    }

    return {
        scheduleId: schedule.Id,
        routeNumber: schedule.RouteNumber,
        routeName: schedule.RouteName,
        vehicleNumber: schedule.VehicleNumber,
        startTime: schedule.StartTime,
        endTime: schedule.EndTime,
        onDuty: Boolean(openShift),
        startedAt: openShift ? openShift.StartedAt : null
    };
};

const toInspection = (row) => ({
    id: row.Id,
    tokenSerial: row.TokenSerial,
    routeNumber: row.RouteNumber,
    routeName: row.RouteName,
    busNumber: row.VehicleNumber,
    result: row.Result,
    reason: row.Reason || null,
    inspectedAt: row.InspectedAt
});


// ─── Use cases ────────────────────────────────────────────────────────────

// Facade: one call gives the mobile Dashboard everything it needs,
// and the independent queries run in parallel (performance tactic: introduce concurrency)
const getDashboard = async (inspectorId) => {

    const { from, to } = todayRange();

    const [user, schedule, openShift, total, valid, recent] = await Promise.all([
        inspectorRepository.findInspectorById(inspectorId),
        inspectorRepository.findScheduleForDate(inspectorId, todayString()),
        inspectorRepository.findOpenShift(inspectorId),
        inspectorRepository.countInspectionsBetween(inspectorId, from, to),
        inspectorRepository.countInspectionsBetween(inspectorId, from, to, "Valid"),
        inspectorRepository.findRecentInspections(inspectorId, 3)
    ]);

    if (!user) {
        throw notFound("Inspector not found");
    }

    return {
        profile: toProfile(user),
        shift: toShift(schedule, openShift),
        todayStats: { total, valid, violations: total - valid },
        recentInspections: recent.map(toInspection)
    };
};

// Business rules: you can only start a shift you are scheduled for, and only once
const startShift = async (inspectorId) => {

    const schedule = await inspectorRepository.findScheduleForDate(inspectorId, todayString());

    if (!schedule) {
        throw notFound("No shift is scheduled for you today");
    }

    const openShift = await inspectorRepository.findOpenShift(inspectorId);

    if (openShift) {
        throw conflict("Your shift has already started");
    }

    const shift = await inspectorRepository.createShift(inspectorId, schedule.Id);

    return toShift(schedule, shift);
};

const endShift = async (inspectorId) => {

    const openShift = await inspectorRepository.findOpenShift(inspectorId);

    if (!openShift) {
        throw conflict("You have no active shift to end");
    }

    await inspectorRepository.closeShift(openShift.Id);

    const schedule = await inspectorRepository.findScheduleForDate(inspectorId, todayString());

    return toShift(schedule, null);
};


module.exports = {
    getDashboard,
    startShift,
    endShift
};
