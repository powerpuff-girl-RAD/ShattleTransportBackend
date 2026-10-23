// Unit tests for the inspector's Scan (tap-in / tap-out), Validate and shift-end
// settlement. Runs against an in-memory fake of the repository whose
// withTransaction really rolls back, so no database is needed.
//
//   npm test

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { createTicketingService } = require("../src/service/ticketing.service");
const rules = require("../src/service/ticketing.rules");

const TODAY = "2026-10-22";
const NOW = new Date(`${TODAY}T10:00:00`);
const INSPECTOR = 3;
const PASSENGER = 4;
const FULL_ROUTE_FARE = 200;   // what the fake fare calculator returns for the whole route

// ─── In-memory world ──────────────────────────────────────────────────────

const makeWorld = () => {

    const db = {
        bookings: [{
            Id: 5, TokenSerial: "TK-BK-1", UserId: PASSENGER, RouteId: 6, RouteNumber: "245",
            RouteName: "Negombo - Colombo Fort", ScheduleDate: TODAY, Status: "Booked", TokenStatus: "Active",
            FareAmount: 170, DistanceKm: 26, AdultCount: 1, MinorCount: 0, IsPeak: true,
            BoardingStop: { StopId: 1, StopName: "Negombo Bus Stand", DistanceFromStartKm: 0 },
            AlightingStop: { StopId: 4, StopName: "Wattala", DistanceFromStartKm: 26 }
        }],
        tokens: [{ TokenSerial: "TK-BK-1", UserId: PASSENGER, Status: "Active", IsBookingToken: true }],
        journeys: [],
        accounts: [{ UserId: PASSENGER, Balance: 1000 }],
        shifts: [{ Id: 1, InspectorId: INSPECTOR, ScheduleId: 82, StartedAt: NOW, EndedAt: null }],
        violations: [],
        routes: [{ Id: 6, RouteNumber: "245", DistanceKm: 34.2, stops: [] }],
        notifications: []
    };

    const schedules = {
        82: { Id: 82, RouteId: 6, RouteNumber: "245", RouteName: "Negombo - Colombo Fort", VehicleNumber: "NB-1234" }
    };

    let nextId = 100;
    const copy = (x) => (x ? structuredClone(x) : null);
    const balance = () => db.accounts.find((a) => a.UserId === PASSENGER).Balance;

    const repo = {
        findBookingByTokenSerial: async (s) => copy(db.bookings.find((b) => b.TokenSerial === s)),
        findBookingById: async (id) => copy(db.bookings.find((b) => b.Id === Number(id))),
        findTokenBySerial: async (s) => copy(db.tokens.find((t) => t.TokenSerial === s)),
        findJourneyForBooking: async (b) => copy([...db.journeys].reverse()
            .find((j) => j.BookingId === b.Id || (j.TokenSerial === b.TokenSerial && j.UserId === b.UserId))),
        findActiveJourneyForUser: async (u) => copy(db.journeys.find((j) => j.UserId === u && j.Status === "InProgress")),
        getAccount: async (u) => copy(db.accounts.find((a) => a.UserId === u)),
        findShift: async (id) => copy(db.shifts.find((s) => s.Id === Number(id))),
        findInProgressJourneysForShift: async (id) => copy(db.journeys.filter((j) => j.ShiftId === Number(id) && j.Status === "InProgress")),
        findRoute: async (id) => copy(db.routes.find((r) => r.Id === Number(id))),
        insertJourney: async (data) => {
            if (data.BookingId && db.journeys.some((j) => j.BookingId === data.BookingId)) {
                throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
            }
            const journey = { Id: ++nextId, ...data };
            db.journeys.push(journey);
            return copy(journey);
        },
        transitionJourney: async (id, from, fields) => {
            const journey = db.journeys.find((j) => j.Id === id && j.Status === from);
            if (!journey) return null;
            Object.assign(journey, fields);
            return copy(journey);
        },
        debitAccount: async (u, amount) => {
            const account = db.accounts.find((a) => a.UserId === u);
            if (!account) return null;
            const before = account.Balance;
            account.Balance = rules.round2(account.Balance - amount);
            return { before };
        },
        updateBooking: async (id, fields) => { Object.assign(db.bookings.find((b) => b.Id === id), fields); },
        insertViolation: async (data) => {
            const violation = { Id: ++nextId, ...data };
            db.violations.push(violation);
            return copy(violation);
        },
        markShiftSettled: async (id, summary) => { Object.assign(db.shifts.find((s) => s.Id === id), { SettledAt: NOW, Settlement: summary }); }
    };

    // Fake transaction: snapshot, run, restore the snapshot if the work throws
    const withTransaction = async (work) => {
        const snapshot = structuredClone(db);
        try {
            return await work("session");
        } catch (error) {
            Object.assign(db, snapshot);
            throw error;
        }
    };

    const service = createTicketingService({
        repo,
        shifts: {
            findOpenShift: async (inspectorId) => copy(db.shifts.find((s) => s.InspectorId === inspectorId && !s.EndedAt)),
            findScheduleById: async (id) => copy(schedules[id])
        },
        resolveSerial: ({ tokenSerial, qrPayload }) => qrPayload === "EXPIRED-QR"
            ? { serial: null, qrError: "This QR code has expired.", qrErrorCode: "EXPIRED" }
            : { serial: String(tokenSerial || qrPayload).toUpperCase() },
        fullRouteFare: async () => FULL_ROUTE_FARE,
        notify: async (n) => { db.notifications.push(n); },
        withTransaction,
        now: () => NOW
    });

    const endShift = () => { db.shifts[0].EndedAt = NOW; };

    return { db, repo, service, balance, endShift, schedules };
};

const scan = (w, serial = "TK-BK-1") => w.service.scan(INSPECTOR, { tokenSerial: serial });
const validate = (w, serial = "TK-BK-1") => w.service.validate(INSPECTOR, { tokenSerial: serial });

const rejectsWith = (promise, status, code) =>
    assert.rejects(promise, (error) => {
        assert.equal(error.statusCode, status);
        assert.equal(error.code, code);
        return true;
    });


// ─── Scan ─────────────────────────────────────────────────────────────────

describe("Scan", () => {
    let w;
    beforeEach(() => { w = makeWorld(); });

    test("first scan taps in: journey InProgress with entry time, inspector and shift; nothing charged", async () => {
        const result = await scan(w);

        assert.equal(result.action, "TAP_IN");
        assert.equal(w.db.journeys.length, 1);
        const journey = w.db.journeys[0];
        assert.equal(journey.Status, "InProgress");
        assert.equal(journey.BookingId, 5);
        assert.equal(journey.InspectorId, INSPECTOR);
        assert.equal(journey.ShiftId, 1);
        assert.deepEqual(journey.EntryAt, NOW);
        assert.equal(w.db.bookings[0].Status, "InProgress");
        assert.equal(w.balance(), 1000);
    });

    test("second scan taps out: journey Completed with exit time, booked-segment fare deducted", async () => {
        await scan(w);
        const result = await scan(w);

        assert.equal(result.action, "TAP_OUT");
        assert.equal(result.fare, 170);
        assert.equal(result.balance, 830);
        assert.equal(w.balance(), 830);
        const journey = w.db.journeys[0];
        assert.equal(journey.Status, "Completed");
        assert.deepEqual(journey.ExitAt, NOW);
        assert.equal(journey.FareAmount, 170);
        assert.equal(journey.PaymentStatus, "Paid");
        assert.equal(w.db.bookings[0].Status, "Completed");
    });

    test("third scan of a completed journey is rejected and does not charge again", async () => {
        await scan(w);
        await scan(w);

        await rejectsWith(scan(w), 409, "ALREADY_USED");
        assert.equal(w.balance(), 830);
        assert.equal(w.db.journeys.length, 1);
    });

    test("a tap-out that loses a race rolls back its charge (single transaction)", async () => {
        await scan(w);
        const realTransition = w.repo.transitionJourney;
        w.repo.transitionJourney = async () => null;   // another device tapped out first

        await rejectsWith(scan(w), 409, "ALREADY_USED");
        assert.equal(w.balance(), 1000);
        assert.equal(w.db.journeys[0].Status, "InProgress");
        w.repo.transitionJourney = realTransition;
    });

    test("rejects a booking for a different route than the current shift", async () => {
        w.db.bookings[0].RouteId = 7;
        w.db.bookings[0].RouteNumber = "187";

        await rejectsWith(scan(w), 409, "WRONG_ROUTE");
        assert.equal(w.db.journeys.length, 0);
    });

    test("rejects scanning when the inspector has no active shift", async () => {
        w.endShift();
        await assert.rejects(scan(w), { statusCode: 409 });
    });

    test("insufficient balance at tap-out: full fare charged, debt recorded, next tap-in blocked", async () => {
        w.db.accounts[0].Balance = 100;
        await scan(w);
        const result = await scan(w);

        assert.equal(result.balance, -70);
        assert.equal(result.paymentStatus, "Outstanding");
        assert.equal(result.outstandingAmount, 70);
        assert.equal(w.db.journeys[0].OutstandingAmount, 70);

        // A second booking by the same passenger can't tap in until they top up
        w.db.bookings.push({ ...w.db.bookings[0], Id: 6, TokenSerial: "TK-BK-2", Status: "Booked" });
        w.db.tokens.push({ TokenSerial: "TK-BK-2", UserId: PASSENGER, Status: "Active" });
        await rejectsWith(scan(w, "TK-BK-2"), 402, "OUTSTANDING_DEBT");
    });
});


// ─── Validate ─────────────────────────────────────────────────────────────

describe("Validate (read-only)", () => {
    let w;
    beforeEach(() => { w = makeWorld(); });

    test("VALID for an active booking on the shift's route, and changes nothing", async () => {
        const before = structuredClone(w.db);
        const result = await validate(w);

        assert.equal(result.valid, true);
        assert.equal(result.code, "VALID");
        assert.equal(result.journeyStatus, "NotTappedIn");
        assert.deepEqual(w.db, before);
    });

    test("INVALID - wrong route", async () => {
        w.db.bookings[0].RouteId = 7;
        const before = structuredClone(w.db);
        const result = await validate(w);

        assert.equal(result.valid, false);
        assert.equal(result.code, "WRONG_ROUTE");
        assert.deepEqual(w.db, before);
    });

    test("INVALID - expired (booking date passed, expired token, or expired QR)", async () => {
        w.db.bookings[0].ScheduleDate = "2026-10-21";
        assert.equal((await validate(w)).code, "EXPIRED");

        w.db.bookings[0].ScheduleDate = TODAY;
        w.db.tokens[0].Status = "Expired";
        assert.equal((await validate(w)).code, "EXPIRED");

        const qr = await w.service.validate(INSPECTOR, { qrPayload: "EXPIRED-QR" });
        assert.equal(qr.valid, false);
        assert.equal(qr.code, "EXPIRED");
    });

    test("INVALID - already used once the journey is completed", async () => {
        await scan(w);
        await scan(w);
        const result = await validate(w);

        assert.equal(result.valid, false);
        assert.equal(result.code, "ALREADY_USED");
    });

    test("INVALID - unknown QR", async () => {
        const result = await validate(w, "TK-BK-404");
        assert.equal(result.valid, false);
        assert.equal(result.code, "UNKNOWN_QR");
    });
});


// ─── Shift-end settlement ─────────────────────────────────────────────────

describe("Shift-end settlement", () => {
    let w;
    beforeEach(() => { w = makeWorld(); });

    test("charges 1.10 × the whole-route fare instead of the booked fare, closes the journey, records a violation and notifies", async () => {
        await scan(w);   // tapped in, never tapped out
        w.endShift();

        const summary = await w.service.settleShift(1);

        assert.equal(summary.settledCount, 1);
        assert.equal(summary.totalCharged, 220);
        assert.equal(w.balance(), 780);   // 1000 - 220, NOT 1000 - 170 - 220

        const journey = w.db.journeys[0];
        assert.equal(journey.Status, "AutoClosedPenalty");
        assert.equal(journey.FullRouteFare, 200);
        assert.equal(journey.PenaltyAmount, 20);
        assert.equal(journey.FareAmount, 220);

        assert.equal(w.db.violations.length, 1);
        assert.equal(w.db.violations[0].ViolationType, "Missed Tap-Out");
        assert.equal(w.db.violations[0].JourneyId, journey.Id);
        assert.ok(w.db.notifications.some((n) => n.type === "MissedTapOutPenalty" && n.userId === PASSENGER));
    });

    test("is idempotent: running it twice charges once", async () => {
        await scan(w);
        w.endShift();

        await w.service.settleShift(1);
        const second = await w.service.settleShift(1);

        assert.equal(second.settledCount, 0);
        assert.equal(w.balance(), 780);
        assert.equal(w.db.violations.length, 1);
    });

    test("leaves completed journeys alone", async () => {
        await scan(w);
        await scan(w);
        w.endShift();

        const summary = await w.service.settleShift(1);
        assert.equal(summary.settledCount, 0);
        assert.equal(w.balance(), 830);
    });

    test("insufficient balance: charges in full and records the outstanding debt", async () => {
        w.db.accounts[0].Balance = 50;
        await scan(w);
        w.endShift();

        const summary = await w.service.settleShift(1);

        assert.equal(w.balance(), -170);
        assert.equal(summary.journeys[0].paymentStatus, "Outstanding");
        assert.equal(summary.journeys[0].outstandingAmount, 170);
        assert.equal(w.db.journeys[0].OutstandingAmount, 170);
    });

    test("refuses to settle a shift that is still running", async () => {
        await scan(w);
        await assert.rejects(w.service.settleShift(1), { statusCode: 409 });
        assert.equal(w.balance(), 1000);
    });
});


// ─── Rules ────────────────────────────────────────────────────────────────

describe("Rules", () => {
    test("settlementCharge rounds money to 2 decimals", () => {
        assert.deepEqual(rules.settlementCharge(173.33), { fullRouteFare: 173.33, penaltyAmount: 17.33, chargedAmount: 190.66 });
    });

    test("applyDebit: only the shortfall becomes outstanding", () => {
        assert.deepEqual(rules.applyDebit(30, 100), {
            balanceBefore: 30, balanceAfter: -70, chargedAmount: 100, outstandingAmount: 70, paymentStatus: "Outstanding"
        });
        assert.equal(rules.applyDebit(-20, 50).outstandingAmount, 50);
        assert.equal(rules.applyDebit(500, 50).paymentStatus, "Paid");
    });
});
