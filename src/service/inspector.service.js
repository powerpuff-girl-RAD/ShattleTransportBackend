const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const env = require("../config/env");
const inspectorRepository = require("../repository/inspector.repository");
const tokenRepository = require("../repository/token.repository");
const journeyRepository = require("../repository/journey.repository");
const { runChecks } = require("./inspection.checks");
const { badRequest, notFound, conflict } = require("../utils/errors");


// ─── Rules ────────────────────────────────────────────────────────────────

const VIOLATION_TYPES = [
    "No Boarding Scan",
    "Expired Token",
    "Insufficient Credit",
    "Invalid Token",
    "Invalid Journey",
    "Other"
];

const LOCATIONS = ["En Route", "At Stop", "Terminal"];

const STATS_PERIODS = [1, 7, 30];

const DAY_MS = 24 * 60 * 60 * 1000;


// ─── Helpers ──────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");

// Schedules store the date as a "YYYY-MM-DD" string (HTML date input format)
const toDateString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const todayString = () => toDateString(new Date());

// From the start of today up to (not including) the start of tomorrow, in server time
const todayRange = () => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + DAY_MS);
    return { from, to };
};

const isDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

// A whole calendar day ("YYYY-MM-DD") in server time
const dayRange = (date) => {
    const from = new Date(`${date}T00:00:00`);
    return { from, to: new Date(from.getTime() + DAY_MS) };
};

// Every "YYYY-MM-DD" from `from` up to today, so days with no inspections still show as 0
const daysSince = (from) => {
    const days = [];
    for (let d = new Date(from); d <= new Date(); d = new Date(d.getTime() + DAY_MS)) {
        days.push(toDateString(d));
    }
    return days;
};

// QR codes carry a short-lived signed JWT (made by token.service generateQR).
// Smartcards / barcodes are typed in by the inspector as a plain serial.
const resolveSerial = ({ qrPayload, tokenSerial }) => {

    if (tokenSerial) {
        return { serial: String(tokenSerial).trim().toUpperCase() };
    }

    try {
        const decoded = jwt.verify(qrPayload, env.jwt.qrSecret);
        return { serial: decoded.serial };
    } catch {
        return { serial: null, qrError: "QR code is invalid or has expired. Ask the passenger to refresh it." };
    }
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
    inspectedAt: row.InspectedAt,
    hasViolation: Boolean(row.ViolationId)
});

const toViolation = (row) => ({
    id: row.Id,
    inspectionId: row.InspectionId,
    tokenSerial: row.TokenSerial,
    violationType: row.ViolationType,
    location: row.Location,
    notes: row.Notes || "",
    routeNumber: row.RouteNumber,
    routeName: row.RouteName,
    busNumber: row.VehicleNumber,
    recordedAt: row.RecordedAt
});

// Turns the repository's $facet result into the shape both the Statistics
// screen and the manager report use
const toStats = (facets, days) => {

    const total = facets.totals[0]?.total ?? 0;
    const invalid = facets.totals[0]?.invalid ?? 0;
    const byDay = new Map(facets.byDay.map((d) => [d._id, d]));

    return {
        totals: {
            total,
            valid: total - invalid,
            invalid,
            validRate: total ? Math.round(((total - invalid) / total) * 100) : 0
        },
        byReason: facets.byReason.map((r) => ({ reason: r._id || "Other", count: r.count })),
        byRoute: facets.byRoute.map((r) => ({
            routeNumber: r._id.routeNumber,
            routeName: r._id.routeName,
            total: r.total,
            invalid: r.invalid
        })),
        byDay: days.map((date) => ({
            date,
            total: byDay.get(date)?.total ?? 0,
            invalid: byDay.get(date)?.invalid ?? 0
        }))
    };
};


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

// Inspect one passenger token. Every inspection is saved, valid or not:
// that is the audit trail (Lecture 7) and the data managers use for reports.
const inspect = async (inspectorId, input) => {

    if (!input.qrPayload && !input.tokenSerial) {
        throw badRequest("qrPayload or tokenSerial is required");
    }

    // Business rule: inspections only happen during an active shift
    const openShift = await inspectorRepository.findOpenShift(inspectorId);

    if (!openShift) {
        throw conflict("Start your shift before inspecting tickets");
    }

    const { serial, qrError } = resolveSerial(input);

    const [schedule, token] = await Promise.all([
        inspectorRepository.findScheduleById(openShift.ScheduleId),
        serial ? tokenRepository.getTokenBySerial(serial) : null
    ]);

    // Reuse the passenger team's journey feature (reusability, Lecture 5)
    const journey = token ? await journeyRepository.getActiveJourney(token.UserId) : null;

    const outcome = runChecks({ token, journey, schedule, qrError, now: new Date() });

    const inspection = await inspectorRepository.createInspection({
        InspectorId: Number(inspectorId),
        ShiftId: openShift.Id,
        ScheduleId: openShift.ScheduleId,
        TokenSerial: serial || "UNREADABLE",
        PassengerUserId: token ? token.UserId : null,
        RouteNumber: schedule?.RouteNumber ?? null,
        RouteName: schedule?.RouteName ?? null,
        VehicleNumber: schedule?.VehicleNumber ?? null,
        Method: input.qrPayload ? "QR" : "Manual",
        Result: outcome.result,
        Reason: outcome.reason,
        Message: outcome.message
    });

    return {
        inspection: toInspection(inspection),
        message: outcome.message,
        checks: outcome.steps,
        // Confidentiality: only what the inspector needs, never email or account ids
        passenger: token ? { name: token.PassengerName, balance: Number(token.Balance) } : null,
        journey: journey ? {
            routeNumber: journey.RouteNumber,
            boardingStop: journey.BoardingStop?.StopName ?? null,
            boardedAt: journey.BoardingStop?.Timestamp ?? journey.CreatedAt
        } : null
    };
};


// ─── History ──────────────────────────────────────────────────────────────

// Filters: date ("YYYY-MM-DD"), route (route number), bus (vehicle number), result (Valid / Invalid)
const listInspections = async (inspectorId, { date, route, bus, result } = {}) => {

    const filter = { InspectorId: Number(inspectorId) };

    if (date) {
        if (!isDateString(date)) {
            throw badRequest("date must be in YYYY-MM-DD format");
        }
        const { from, to } = dayRange(date);
        filter.InspectedAt = { $gte: from, $lt: to };
    }

    if (route) {
        filter.RouteNumber = String(route);
    }

    if (bus) {
        filter.VehicleNumber = String(bus);
    }

    if (result) {
        if (!["Valid", "Invalid"].includes(result)) {
            throw badRequest("result must be Valid or Invalid");
        }
        filter.Result = result;
    }

    const [rows, filters] = await Promise.all([
        inspectorRepository.findInspections(filter),
        inspectorRepository.findInspectionFilterOptions(inspectorId)
    ]);

    return { inspections: rows.map(toInspection), filters };
};

const getInspection = async (inspectorId, inspectionId) => {

    const row = await inspectorRepository.findInspectionById(inspectorId, inspectionId);

    if (!row) {
        throw notFound("Inspection not found");
    }

    const violation = row.ViolationId
        ? await inspectorRepository.findViolationByInspectionId(row.Id)
        : null;

    return {
        ...toInspection(row),
        method: row.Method,
        message: row.Message,
        violation: violation ? toViolation(violation) : null
    };
};


// ─── Violations ───────────────────────────────────────────────────────────

// Business rules: only for your own INVALID inspections, and only once each.
// Route, bus and time are copied from the inspection, so the record can't be faked.
const recordViolation = async (inspectorId, { inspectionId, violationType, location, notes }) => {

    if (!inspectionId) {
        throw badRequest("inspectionId is required");
    }

    if (!VIOLATION_TYPES.includes(violationType)) {
        throw badRequest(`violationType must be one of: ${VIOLATION_TYPES.join(", ")}`);
    }

    if (!LOCATIONS.includes(location)) {
        throw badRequest(`location must be one of: ${LOCATIONS.join(", ")}`);
    }

    if (notes && String(notes).length > 500) {
        throw badRequest("notes must be 500 characters or fewer");
    }

    const inspection = await inspectorRepository.findInspectionById(inspectorId, inspectionId);

    if (!inspection) {
        throw notFound("Inspection not found");
    }

    if (inspection.Result !== "Invalid") {
        throw conflict("Only invalid inspections can be recorded as violations");
    }

    if (inspection.ViolationId) {
        throw conflict("A violation has already been recorded for this inspection");
    }

    const violation = await inspectorRepository.createViolation({
        InspectionId: inspection.Id,
        InspectorId: Number(inspectorId),
        ShiftId: inspection.ShiftId,
        TokenSerial: inspection.TokenSerial,
        PassengerUserId: inspection.PassengerUserId,
        ViolationType: violationType,
        Location: location,
        Notes: notes ? String(notes).trim() : "",
        RouteNumber: inspection.RouteNumber,
        RouteName: inspection.RouteName,
        VehicleNumber: inspection.VehicleNumber,
        InspectedAt: inspection.InspectedAt
    });

    await inspectorRepository.setInspectionViolation(inspection.Id, violation.Id);

    return toViolation(violation);
};

const listViolations = async (inspectorId) => {
    const rows = await inspectorRepository.findViolations(inspectorId);
    return rows.map(toViolation);
};


// ─── Statistics ───────────────────────────────────────────────────────────

// days = 1 (today), 7 or 30, counting today
const getStats = async (inspectorId, days = 7) => {

    const period = Number(days);

    if (!STATS_PERIODS.includes(period)) {
        throw badRequest(`days must be one of: ${STATS_PERIODS.join(", ")}`);
    }

    const from = new Date(todayRange().from.getTime() - (period - 1) * DAY_MS);

    const facets = await inspectorRepository.aggregateInspectionStats({
        InspectorId: Number(inspectorId),
        InspectedAt: { $gte: from }
    });

    return { days: period, ...toStats(facets, daysSince(from)) };
};

// Manager report: how often invalid tickets are found, across ALL inspectors.
// from / to are "YYYY-MM-DD" (inclusive); defaults to the last 30 days.
const getInvalidTicketReport = async ({ from, to, route } = {}) => {

    if ((from && !isDateString(from)) || (to && !isDateString(to))) {
        throw badRequest("from and to must be in YYYY-MM-DD format");
    }

    const end = dayRange(to || todayString()).to;
    const start = from ? dayRange(from).from : new Date(end.getTime() - 30 * DAY_MS);

    if (start >= end) {
        throw badRequest("from must be on or before to");
    }

    const match = { InspectedAt: { $gte: start, $lt: end } };

    if (route) {
        match.RouteNumber = String(route);
    }

    const facets = await inspectorRepository.aggregateInspectionStats(match);

    const days = daysSince(start).filter((d) => d < toDateString(end));

    return {
        from: toDateString(start),
        to: toDateString(new Date(end.getTime() - DAY_MS)),
        ...toStats(facets, days),
        byInspector: facets.byInspector.map((i) => ({
            inspectorId: i._id,
            name: i.name || `Inspector ${i._id}`,
            total: i.total,
            invalid: i.invalid
        }))
    };
};


// ─── Account ──────────────────────────────────────────────────────────────

const changePassword = async (inspectorId, { currentPassword, newPassword }) => {

    if (!currentPassword || !newPassword) {
        throw badRequest("currentPassword and newPassword are required");
    }

    if (String(newPassword).length < 8) {
        throw badRequest("New password must be at least 8 characters");
    }

    if (currentPassword === newPassword) {
        throw badRequest("New password must be different from the current password");
    }

    const passwordHash = await inspectorRepository.findPasswordHash(inspectorId);

    if (!passwordHash) {
        throw notFound("Inspector not found");
    }

    const matches = await bcrypt.compare(currentPassword, passwordHash);

    if (!matches) {
        throw badRequest("Current password is incorrect");
    }

    // Same cost factor as auth.service register
    await inspectorRepository.updatePasswordHash(inspectorId, await bcrypt.hash(newPassword, 12));
};

// Today and the next scheduled shifts (Shift Schedule screen)
const getUpcomingSchedule = async (inspectorId) => {

    const rows = await inspectorRepository.findUpcomingSchedules(inspectorId, todayString());

    return rows.map((s) => ({
        scheduleId: s.Id,
        date: s.Date,
        routeNumber: s.RouteNumber,
        routeName: s.RouteName,
        vehicleNumber: s.VehicleNumber,
        startTime: s.StartTime,
        endTime: s.EndTime,
        status: s.Status || "Scheduled"
    }));
};


module.exports = {
    getDashboard,
    startShift,
    endShift,
    inspect,
    listInspections,
    getInspection,
    recordViolation,
    listViolations,
    getStats,
    getInvalidTicketReport,
    changePassword,
    getUpcomingSchedule
};
