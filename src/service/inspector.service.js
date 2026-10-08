const jwt = require("jsonwebtoken");

const env = require("../config/env");
const inspectorRepository = require("../repository/inspector.repository");
const tokenRepository = require("../repository/token.repository");
const journeyRepository = require("../repository/journey.repository");
const { runChecks } = require("./inspection.checks");
const { badRequest, notFound, conflict } = require("../utils/errors");


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


module.exports = {
    getDashboard,
    startShift,
    endShift,
    inspect
};
