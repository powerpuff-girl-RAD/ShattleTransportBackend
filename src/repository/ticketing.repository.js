const { getCollection, nextId, NO_ID } = require("../config/database");

// Data access for the inspector's Scan (tap-in / tap-out), Validate and shift-end
// settlement. Every write takes an optional MongoDB `session` so the service can
// run a balance change and a journey status change in ONE transaction.

const bookings = () => getCollection("bookings");
const tokens = () => getCollection("passengerTokens");
const journeys = () => getCollection("journeys");
const accounts = () => getCollection("passengerAccounts");
const shifts = () => getCollection("inspectorShifts");
const violations = () => getCollection("violations");
const routes = () => getCollection("routes");

const withSession = (session, options = {}) => (session ? { ...options, session } : options);


// ─── Reads ────────────────────────────────────────────────────────────────

const findBookingByTokenSerial = async (tokenSerial) =>
    (await bookings()).findOne({ TokenSerial: tokenSerial }, NO_ID);

const findBookingById = async (id) =>
    (await bookings()).findOne({ Id: Number(id) }, NO_ID);

const findTokenBySerial = async (tokenSerial) =>
    (await tokens()).findOne({ TokenSerial: tokenSerial }, NO_ID);

// The journey for a booking: linked by BookingId (inspector scans) or by token
// serial (journeys started from the passenger app's gate scanner). Newest first.
const findJourneyForBooking = async (booking) => {
    const rows = await (await journeys())
        .find({
            $or: [
                { BookingId: Number(booking.Id) },
                { TokenSerial: booking.TokenSerial, UserId: Number(booking.UserId) }
            ]
        }, NO_ID)
        .sort({ CreatedAt: -1 })
        .limit(1)
        .toArray();
    return rows[0] || null;
};

const findActiveJourneyForUser = async (userId) =>
    (await journeys()).findOne({ UserId: Number(userId), Status: "InProgress" }, NO_ID);

const getAccount = async (userId) =>
    (await accounts()).findOne({ UserId: Number(userId) }, NO_ID);

const findShift = async (shiftId) =>
    (await shifts()).findOne({ Id: Number(shiftId) }, NO_ID);

const findInProgressJourneysForShift = async (shiftId) =>
    (await journeys()).find({ ShiftId: Number(shiftId), Status: "InProgress" }, NO_ID).toArray();

const findRoute = async (routeId) =>
    (await routes()).findOne({ Id: Number(routeId) }, NO_ID);


// ─── Writes (session-aware) ───────────────────────────────────────────────

const insertJourney = async (data, session) => {
    const journey = { Id: await nextId("journeys"), ...data };
    await (await journeys()).insertOne({ ...journey }, withSession(session));
    return journey;
};

// Moves a journey from one status to another. The status is part of the filter,
// so only ONE caller can win: a second tap-out or a second settlement gets null.
const transitionJourney = async (journeyId, fromStatus, fields, session) =>
    (await journeys()).findOneAndUpdate(
        { Id: Number(journeyId), Status: fromStatus },
        { $set: fields },
        withSession(session, { ...NO_ID, returnDocument: "after" })
    );

// Charges the account (the balance may go negative: debt + block). Returns the
// balance before and after, or null if the passenger has no account.
const debitAccount = async (userId, amount, session) => {
    const before = await (await accounts()).findOneAndUpdate(
        { UserId: Number(userId) },
        { $inc: { Balance: -Number(amount) } },
        withSession(session, { ...NO_ID, returnDocument: "before" })
    );
    return before ? { before: Number(before.Balance || 0) } : null;
};

const updateBooking = async (bookingId, fields, session) =>
    (await bookings()).updateOne(
        { Id: Number(bookingId) },
        { $set: { ...fields, UpdatedAt: new Date().toISOString() } },
        withSession(session)
    );

const insertViolation = async (data, session) => {
    const violation = { Id: await nextId("violations"), ...data };
    await (await violations()).insertOne({ ...violation }, withSession(session));
    return violation;
};

const markShiftSettled = async (shiftId, summary) =>
    (await shifts()).updateOne({ Id: Number(shiftId) }, { $set: { SettledAt: new Date(), Settlement: summary } });

module.exports = {
    findBookingByTokenSerial,
    findBookingById,
    findTokenBySerial,
    findJourneyForBooking,
    findActiveJourneyForUser,
    getAccount,
    findShift,
    findInProgressJourneysForShift,
    findRoute,
    insertJourney,
    transitionJourney,
    debitAccount,
    updateBooking,
    insertViolation,
    markShiftSettled
};
