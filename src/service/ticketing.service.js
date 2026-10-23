const rules = require("./ticketing.rules");
const { badRequest, notFound, conflict, createError } = require("../utils/errors");

const { JOURNEY_STATUS, round2 } = rules;

// Inspector Scan (tap-in / tap-out), Validate (read-only) and shift-end settlement.
//
// Built as a factory so the unit tests can pass in-memory fakes; the module
// exports one instance wired to MongoDB (bottom of the file).
//
// deps:
//   repo            ticketing.repository (or a fake)
//   shifts          { findOpenShift(inspectorId), findScheduleById(id) }
//   resolveSerial   QR / typed text → { serial, qrError, qrErrorCode }
//   fullRouteFare   async ({ route, booking }) → whole-route fare for that booking's passengers
//   notify          async ({ userId, type, title, message, data })
//   withTransaction async (work(session)) → result
//   now             () → Date
const createTicketingService = ({ repo, shifts, resolveSerial, fullRouteFare, notify, withTransaction, now = () => new Date() }) => {

    const pad = (n) => String(n).padStart(2, "0");
    const toDateString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const fail = (decision) => {
        const error = createError(decision.status, decision.message);
        error.code = decision.code;
        return error;
    };

    // Notifications are best-effort: a failure is logged but never undoes the charge
    const notifySafely = async (notification) => {
        try {
            await notify(notification);
        } catch (error) {
            console.error("Notification failed:", error.message);
        }
    };

    const currentShift = async (inspectorId) => {
        const openShift = await shifts.findOpenShift(inspectorId);
        if (!openShift) {
            throw conflict("Start your shift before scanning tickets");
        }
        const schedule = await shifts.findScheduleById(openShift.ScheduleId);
        if (!schedule) {
            throw notFound("The schedule for your shift no longer exists");
        }
        return { openShift, schedule };
    };

    // Everything the rules need about the scanned QR, read without changing anything
    const loadTicket = async (input) => {
        if (!input || (!input.qrPayload && !input.tokenSerial)) {
            throw badRequest("qrPayload or tokenSerial is required");
        }
        const { serial, qrError, qrErrorCode } = resolveSerial(input);
        if (!serial) {
            return { serial: null, qrError, qrErrorCode, booking: null, token: null, journey: null };
        }
        const [booking, token] = await Promise.all([repo.findBookingByTokenSerial(serial), repo.findTokenBySerial(serial)]);
        const journey = booking ? await repo.findJourneyForBooking(booking) : null;
        return { serial, qrError, qrErrorCode, booking, token, journey };
    };

    const toBookingSummary = (booking) => booking && {
        bookingId: booking.Id,
        bookingRef: booking.BookingRef,
        tokenSerial: booking.TokenSerial,
        routeNumber: booking.RouteNumber,
        routeName: booking.RouteName,
        boardingStop: booking.BoardingStop?.StopName ?? null,
        alightingStop: booking.AlightingStop?.StopName ?? null,
        travelDate: booking.ScheduleDate ?? null,
        adultCount: booking.AdultCount ?? booking.PassengerCount ?? 1,
        minorCount: booking.MinorCount ?? 0,
        fareAmount: booking.FareAmount ?? null
    };


    // ─── Scan: first scan taps in, second taps out, third is rejected ─────

    const scan = async (inspectorId, input) => {

        const { openShift, schedule } = await currentShift(inspectorId);
        const ticket = await loadTicket(input);
        const { booking, journey } = ticket;

        const needsTapInChecks = booking && !journey;
        const [account, otherActiveJourney] = needsTapInChecks
            ? await Promise.all([repo.getAccount(booking.UserId), repo.findActiveJourneyForUser(booking.UserId)])
            : [null, null];

        const decision = rules.decideScan({
            ...ticket,
            schedule,
            today: toDateString(now()),
            balance: account ? account.Balance : 0,
            otherActiveJourney
        });

        if (!decision.ok) {
            throw fail(decision);
        }

        return decision.action === "TAP_IN"
            ? tapIn({ inspectorId, openShift, schedule, booking })
            : tapOut({ inspectorId, openShift, booking, journey });
    };

    const tapIn = async ({ inspectorId, openShift, schedule, booking }) => {

        const at = now();

        let journey;
        try {
            journey = await withTransaction(async (session) => {
                const created = await repo.insertJourney({
                    UserId: Number(booking.UserId),
                    BookingId: Number(booking.Id),
                    TokenSerial: booking.TokenSerial,
                    RouteId: Number(booking.RouteId),
                    RouteNumber: booking.RouteNumber,
                    RouteName: booking.RouteName,
                    BoardingStop: { ...booking.BoardingStop, Timestamp: at },
                    AlightingStop: null,
                    DistanceKm: 0,
                    FareAmount: 0,
                    Status: JOURNEY_STATUS.IN_PROGRESS,
                    PaidFrom: "Wallet",
                    Source: "Inspector",
                    InspectorId: Number(inspectorId),
                    ShiftId: Number(openShift.Id),
                    ScheduleId: Number(schedule.Id),
                    EntryAt: at,
                    CreatedAt: at,
                    CompletedAt: null
                }, session);
                await repo.updateBooking(booking.Id, { Status: "InProgress" }, session);
                return created;
            });
        } catch (error) {
            // Unique index on BookingId: another device tapped this booking in a moment ago
            if (error.code === 11000) {
                const err = conflict("This booking was just tapped in. Scan again to tap out.");
                err.code = "ALREADY_TAPPED_IN";
                throw err;
            }
            throw error;
        }

        await notifySafely({
            userId: booking.UserId,
            type: "BoardingConfirmation",
            title: "Tapped in — boarding accepted",
            message: `Boarding accepted on Route ${booking.RouteNumber} at ${booking.BoardingStop?.StopName ?? "your stop"}. The inspector will tap you out at your stop.`,
            data: { journeyId: journey.Id, bookingId: booking.Id, tokenSerial: booking.TokenSerial }
        });

        return {
            action: "TAP_IN",
            message: "Tapped in. Journey started.",
            booking: toBookingSummary(booking),
            journey: { id: journey.Id, status: journey.Status, entryAt: at, exitAt: null }
        };
    };

    const tapOut = async ({ inspectorId, openShift, booking, journey }) => {

        const at = now();
        const fare = round2(booking.FareAmount);   // the booked segment's fare

        const outcome = await withTransaction(async (session) => {
            const debit = await repo.debitAccount(booking.UserId, fare, session);
            if (!debit) {
                throw notFound("The passenger has no wallet account");
            }
            const payment = rules.applyDebit(debit.before, fare);

            // Guarded by Status: InProgress, so a second tap-out can't charge again
            const ended = await repo.transitionJourney(journey.Id, JOURNEY_STATUS.IN_PROGRESS, {
                Status: JOURNEY_STATUS.COMPLETED,
                AlightingStop: { ...booking.AlightingStop, Timestamp: at },
                DistanceKm: Number(booking.DistanceKm || 0),
                FareAmount: fare,
                ChargedAmount: fare,
                PaymentStatus: payment.paymentStatus,
                OutstandingAmount: payment.outstandingAmount,
                ExitAt: at,
                CompletedAt: at,
                TapOutInspectorId: Number(inspectorId),
                TapOutShiftId: Number(openShift.Id)
            }, session);

            if (!ended) {
                const err = conflict("This journey was already tapped out");
                err.code = "ALREADY_USED";
                throw err;   // rolls back the debit
            }

            await repo.updateBooking(booking.Id, {
                Status: "Completed",
                PaymentStatus: payment.paymentStatus,
                CompletedAt: at.toISOString()
            }, session);

            return { ended, payment };
        });

        const { payment } = outcome;

        await notifySafely({
            userId: booking.UserId,
            type: "FareDeduction",
            title: `Fare deducted on tap-out: LKR ${fare.toFixed(2)}`,
            message: payment.outstandingAmount > 0
                ? `LKR ${fare.toFixed(2)} charged. Your balance is now LKR ${payment.balanceAfter.toFixed(2)} — top up LKR ${(-payment.balanceAfter).toFixed(2)} before your next journey.`
                : `LKR ${fare.toFixed(2)} deducted at ${booking.AlightingStop?.StopName ?? "your stop"}. New balance: LKR ${payment.balanceAfter.toFixed(2)}.`,
            data: { journeyId: journey.Id, fareAmount: fare, newBalance: payment.balanceAfter, outstandingAmount: payment.outstandingAmount }
        });

        return {
            action: "TAP_OUT",
            message: payment.outstandingAmount > 0
                ? "Tapped out. Fare charged — the passenger now has an outstanding balance."
                : "Tapped out. Fare charged.",
            booking: toBookingSummary(booking),
            journey: { id: journey.Id, status: JOURNEY_STATUS.COMPLETED, entryAt: journey.EntryAt ?? journey.CreatedAt, exitAt: at },
            fare,
            balance: payment.balanceAfter,
            paymentStatus: payment.paymentStatus,
            outstandingAmount: payment.outstandingAmount
        };
    };


    // ─── Validate: read-only VALID / INVALID ─────────────────────────────

    // Only reads: never creates, updates or charges anything
    const validate = async (inspectorId, input) => {

        const { schedule } = await currentShift(inspectorId);
        const ticket = await loadTicket(input);

        const result = rules.decideValidate({ ...ticket, schedule, today: toDateString(now()) });

        return {
            ...result,
            tokenSerial: ticket.serial,
            booking: toBookingSummary(ticket.booking),
            journeyStatus: ticket.journey ? ticket.journey.Status : "NotTappedIn",
            route: { routeNumber: schedule.RouteNumber, routeName: schedule.RouteName, busNumber: schedule.VehicleNumber }
        };
    };


    // ─── Shift-end settlement ────────────────────────────────────────────

    // Thrown inside the transaction when another run already closed the journey
    class AlreadySettled extends Error {}
    const SKIPPED = "skipped";

    // Charges every journey still in progress on the shift 1.10 × the whole-route fare.
    // Idempotent: each journey moves InProgress → AutoClosedPenalty inside the same
    // transaction as its charge, so a second run finds nothing left to charge.
    const settleShift = async (shiftId, { inspectorId } = {}) => {

        const shift = await repo.findShift(shiftId);

        if (!shift || (inspectorId !== undefined && Number(shift.InspectorId) !== Number(inspectorId))) {
            throw notFound("Shift not found");
        }

        if (!shift.EndedAt) {
            throw conflict("A shift can only be settled after it has ended");
        }

        const schedule = await shifts.findScheduleById(shift.ScheduleId);
        const openJourneys = await repo.findInProgressJourneysForShift(shift.Id);

        const settled = [];
        const failed = [];

        for (const journey of openJourneys) {
            try {
                const result = await settleJourney({ shift, schedule, journey });
                if (result !== SKIPPED) {
                    settled.push(result);
                }
            } catch (error) {
                // Keep going: the journey stays InProgress, so the next run retries it
                console.error(`Settlement failed for journey ${journey.Id}:`, error.message);
                failed.push({ journeyId: journey.Id, message: error.message });
            }
        }

        const summary = {
            shiftId: shift.Id,
            settledCount: settled.length,
            failedCount: failed.length,
            totalCharged: round2(settled.reduce((sum, s) => sum + s.chargedAmount, 0)),
            journeys: settled,
            failed
        };

        await repo.markShiftSettled(shift.Id, { settledCount: summary.settledCount, totalCharged: summary.totalCharged });

        return summary;
    };

    const settleJourney = async ({ shift, schedule, journey }) => {

        const at = now();
        const booking = journey.BookingId ? await repo.findBookingById(journey.BookingId) : null;
        const route = await repo.findRoute(journey.RouteId);
        const charge = rules.settlementCharge(await fullRouteFare({ route, booking }));

        let result;
        try {
            result = await withTransaction(async (session) => {
                const debit = await repo.debitAccount(journey.UserId, charge.chargedAmount, session);
                if (!debit) {
                    throw notFound(`Passenger ${journey.UserId} has no wallet account`);
                }
                const payment = rules.applyDebit(debit.before, charge.chargedAmount);

                const closed = await repo.transitionJourney(journey.Id, JOURNEY_STATUS.IN_PROGRESS, {
                    Status: JOURNEY_STATUS.AUTO_CLOSED_PENALTY,
                    FareAmount: charge.chargedAmount,      // replaces the booked fare, not added to it
                    FullRouteFare: charge.fullRouteFare,
                    PenaltyAmount: charge.penaltyAmount,
                    ChargedAmount: charge.chargedAmount,
                    PaymentStatus: payment.paymentStatus,
                    OutstandingAmount: payment.outstandingAmount,
                    CompletedAt: at,
                    SettledAt: at,
                    SettledByShiftId: Number(shift.Id)
                }, session);

                if (!closed) {
                    throw new AlreadySettled();   // closed by another run: roll back the debit
                }

                if (booking) {
                    await repo.updateBooking(booking.Id, {
                        Status: JOURNEY_STATUS.AUTO_CLOSED_PENALTY,
                        PaymentStatus: payment.paymentStatus,
                        CompletedAt: at.toISOString()
                    }, session);
                }

                const violation = await repo.insertViolation({
                    InspectionId: null,
                    JourneyId: Number(journey.Id),
                    InspectorId: Number(shift.InspectorId),
                    ShiftId: Number(shift.Id),
                    TokenSerial: journey.TokenSerial,
                    PassengerUserId: Number(journey.UserId),
                    ViolationType: "Missed Tap-Out",
                    Location: "Terminal",
                    Notes: `Not tapped out by the end of the shift. Charged the whole-route fare LKR ${charge.fullRouteFare.toFixed(2)} + 10% penalty LKR ${charge.penaltyAmount.toFixed(2)}.`,
                    RouteNumber: journey.RouteNumber,
                    RouteName: journey.RouteName,
                    VehicleNumber: schedule?.VehicleNumber ?? null,
                    InspectedAt: at,
                    RecordedAt: at,
                    Automatic: true
                }, session);

                return { payment, violation };
            });
        } catch (error) {
            if (error instanceof AlreadySettled) {
                return SKIPPED;
            }
            throw error;
        }

        await notifySafely({
            userId: journey.UserId,
            type: "MissedTapOutPenalty",
            title: `Missed tap-out: LKR ${charge.chargedAmount.toFixed(2)} charged`,
            message: `You were not tapped out on Route ${journey.RouteNumber}. You were charged the whole-route fare (LKR ${charge.fullRouteFare.toFixed(2)}) plus a 10% penalty (LKR ${charge.penaltyAmount.toFixed(2)}).`
                + (result.payment.outstandingAmount > 0 ? ` Your balance is LKR ${result.payment.balanceAfter.toFixed(2)}; top up before your next journey.` : ""),
            data: { journeyId: journey.Id, ...charge, newBalance: result.payment.balanceAfter }
        });

        return {
            journeyId: journey.Id,
            userId: journey.UserId,
            tokenSerial: journey.TokenSerial,
            ...charge,
            paymentStatus: result.payment.paymentStatus,
            outstandingAmount: result.payment.outstandingAmount,
            violationId: result.violation.Id
        };
    };

    return { scan, validate, settleShift };
};


// ─── Production wiring ────────────────────────────────────────────────────

// Whole-route fare for the booking's passengers, using the existing booking fare
// calculation (first stop → last stop, same peak flag, adults + 50% minors)
const defaultFullRouteFare = async ({ route, booking }) => {

    if (!route) {
        throw notFound("The journey's route no longer exists");
    }

    const stops = [...(route.stops || [])].sort((a, b) => Number(a.StopOrder) - Number(b.StopOrder));

    // Lazy require: booking.service pulls in journey.service and many repositories
    const { calculateBookingFare } = require("./booking.service");
    const { calculateFare } = require("./journey.service");

    if (stops.length >= 2) {
        const fare = await calculateBookingFare({
            routeId: route.Id,
            boardingStopId: stops[0].Id,
            alightingStopId: stops[stops.length - 1].Id,
            isPeak: booking?.IsPeak ?? true,
            adultCount: booking?.AdultCount ?? 1,
            minorCount: booking?.MinorCount ?? 0
        });
        return fare.fareAmount;
    }

    // Route without stop data: price the whole distance for one adult
    const fare = await calculateFare(route.DistanceKm, booking?.IsPeak ?? true);
    return fare.fareAmount;
};

const createDefault = () => {
    const { withTransaction } = require("../config/database");
    const inspectorRepository = require("../repository/inspector.repository");
    const notificationRepository = require("../repository/notification.repository");
    const { resolveSerial } = require("./qrSerial");

    return createTicketingService({
        repo: require("../repository/ticketing.repository"),
        shifts: {
            findOpenShift: inspectorRepository.findOpenShift,
            findScheduleById: inspectorRepository.findScheduleById
        },
        resolveSerial,
        fullRouteFare: defaultFullRouteFare,
        notify: notificationRepository.createNotification,
        withTransaction
    });
};

let instance;
const service = () => (instance ??= createDefault());

module.exports = {
    createTicketingService,
    scan: (...args) => service().scan(...args),
    validate: (...args) => service().validate(...args),
    settleShift: (...args) => service().settleShift(...args)
};
