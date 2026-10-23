// Business rules for the inspector's Scan (tap-in / tap-out), Validate and
// shift-end settlement. Pure functions: no database, no clock — the service
// passes everything in, so every rule can be unit tested on its own.

const JOURNEY_STATUS = {
    IN_PROGRESS: "InProgress",
    COMPLETED: "Completed",
    AUTO_CLOSED_PENALTY: "AutoClosedPenalty"
};

const PAYMENT_STATUS = {
    PAID: "Paid",
    OUTSTANDING: "Outstanding"   // balance went negative; boarding blocked until topped up
};

const PENALTY_RATE = 0.10;

const FINISHED = [JOURNEY_STATUS.COMPLETED, JOURNEY_STATUS.AUTO_CLOSED_PENALTY];

// Money is LKR with 2 decimals
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const reject = (status, code, reason, message) => ({ ok: false, status, code, reason, message });


// ─── Shared ticket checks (Scan and Validate) ─────────────────────────────

// Unknown QR, wrong route, inactive / expired token. Journey state is checked separately.
const checkTicket = ({ booking, token, schedule, qrErrorCode, qrError, today }) => {

    if (!booking) {
        if (qrErrorCode === "EXPIRED") {
            return reject(400, "EXPIRED", "Expired", qrError);
        }
        return reject(404, "UNKNOWN_QR", "Unknown QR", qrError || "This QR code is not a Shattle booking");
    }

    if (Number(booking.RouteId) !== Number(schedule.RouteId)) {
        // Same number, different route record (e.g. the route was deleted and created again)
        const message = String(booking.RouteNumber) === String(schedule.RouteNumber)
            ? `This booking is for a different route ${booking.RouteNumber} record (#${booking.RouteId}) than this bus (#${schedule.RouteId}). The route may have been re-created; the passenger should book again.`
            : `This booking is for route ${booking.RouteNumber}, not this bus's route ${schedule.RouteNumber}`;
        return reject(409, "WRONG_ROUTE", "Wrong Route", message);
    }

    if (booking.Status === "Cancelled" || booking.TokenStatus === "Cancelled") {
        return reject(409, "NOT_ACTIVE", "Not Active", "This booking has been cancelled");
    }

    if (booking.TokenStatus !== "Active") {
        return reject(409, "NOT_ACTIVE", "Not Active", "The passenger has not activated this booking's token yet");
    }

    if (token && token.Status === "Expired") {
        return reject(400, "EXPIRED", "Expired", "This token has expired");
    }

    if (booking.ScheduleDate && booking.ScheduleDate < today) {
        return reject(400, "EXPIRED", "Expired", `This booking was for ${booking.ScheduleDate}`);
    }

    return { ok: true };
};

const alreadyUsed = (journey, booking) =>
    FINISHED.includes(journey?.Status) || FINISHED.includes(booking?.Status);


// ─── Scan ─────────────────────────────────────────────────────────────────

// First scan → TAP_IN, second scan (journey in progress) → TAP_OUT, anything after → rejected.
const decideScan = ({ booking, token, schedule, journey, today, balance, otherActiveJourney, qrErrorCode, qrError }) => {

    if (!booking && !qrErrorCode && token) {
        return reject(400, "NOT_A_BOOKING", "Not a Booking", "Only booking QR codes can be scanned for tap-in and tap-out");
    }

    // Tap-out of a journey already in progress must still work after midnight / token expiry,
    // so the route check is the only ticket check that applies to it
    if (journey?.Status === JOURNEY_STATUS.IN_PROGRESS) {
        if (Number(booking.RouteId) !== Number(schedule.RouteId)) {
            return checkTicket({ booking, token, schedule, today });
        }
        return { ok: true, action: "TAP_OUT" };
    }

    if (booking && alreadyUsed(journey, booking)) {
        return reject(409, "ALREADY_USED", "Already Used", "This booking's journey is already completed. It can't be scanned again.");
    }

    const ticket = checkTicket({ booking, token, schedule, qrErrorCode, qrError, today });
    if (!ticket.ok) {
        return ticket;
    }

    if (Number(balance) < 0) {
        return reject(402, "OUTSTANDING_DEBT", "Outstanding Debt",
            `The passenger owes LKR ${round2(-balance).toFixed(2)}. They must top up before boarding.`);
    }

    if (otherActiveJourney) {
        return reject(409, "ALREADY_TRAVELLING", "Already Travelling",
            `The passenger is already on a journey with token ${otherActiveJourney.TokenSerial}`);
    }

    return { ok: true, action: "TAP_IN" };
};


// ─── Validate (read-only) ─────────────────────────────────────────────────

const decideValidate = ({ booking, token, schedule, journey, today, qrErrorCode, qrError }) => {

    if (!booking && !qrErrorCode && token) {
        return { valid: false, code: "UNKNOWN_QR", reason: "Unknown QR", message: "This token is not a booking" };
    }

    const ticket = checkTicket({ booking, token, schedule, qrErrorCode, qrError, today });

    // A journey in progress stays valid even if its date has just passed
    const inProgress = journey?.Status === JOURNEY_STATUS.IN_PROGRESS;
    if (!ticket.ok && !(inProgress && ticket.code === "EXPIRED")) {
        return { valid: false, code: ticket.code, reason: ticket.reason, message: ticket.message };
    }

    if (alreadyUsed(journey, booking)) {
        return { valid: false, code: "ALREADY_USED", reason: "Already Used", message: "This booking's journey is already completed" };
    }

    return {
        valid: true,
        code: "VALID",
        reason: null,
        message: inProgress ? "Valid booking, journey in progress" : "Valid booking for this route (not tapped in yet)"
    };
};


// ─── Charging ─────────────────────────────────────────────────────────────

// Debt + block: the full amount is always charged. If the balance can't cover it,
// the balance goes negative and the shortfall is recorded as outstanding.
const applyDebit = (balanceBefore, amount) => {
    const before = round2(balanceBefore);
    const charged = round2(amount);
    const outstandingAmount = round2(Math.max(0, charged - Math.max(0, before)));
    return {
        balanceBefore: before,
        balanceAfter: round2(before - charged),
        chargedAmount: charged,
        outstandingAmount,
        paymentStatus: outstandingAmount > 0 ? PAYMENT_STATUS.OUTSTANDING : PAYMENT_STATUS.PAID
    };
};

// Missed tap-out: whole route fare + 10%, which REPLACES the booked-segment fare
const settlementCharge = (fullRouteFare) => {
    const full = round2(fullRouteFare);
    const penaltyAmount = round2(full * PENALTY_RATE);
    return { fullRouteFare: full, penaltyAmount, chargedAmount: round2(full + penaltyAmount) };
};

module.exports = {
    JOURNEY_STATUS,
    PAYMENT_STATUS,
    PENALTY_RATE,
    round2,
    checkTicket,
    decideScan,
    decideValidate,
    applyDebit,
    settlementCharge
};
