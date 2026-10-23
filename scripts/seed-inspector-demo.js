// Seeds demo data so the Ticket Inspector app can be tested end to end TODAY.
//
//   node scripts/seed-inspector-demo.js          → remove old demo data, then seed fresh
//   node scripts/seed-inspector-demo.js --clean  → only remove demo data
//   ... --inspector inspector1@shuttle.com       → also give that real inspector today's shift
//
// Every record created here has Demo: true (plus everything the demo users
// created through the app), so --clean removes it without touching real data.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const { getCollection, nextId, close } = require("../src/config/database");

const PASSWORD = "Demo@1234";
const DEMO_EMAIL = /@shattle\.demo$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

// --inspector a@x.com --inspector b@y.com → real accounts that also get today's shift
const inspectorEmails = () => process.argv
    .flatMap((arg, i, all) => (arg === "--inspector" && all[i + 1] ? [all[i + 1]] : []));

const pad = (n) => String(n).padStart(2, "0");
const toDateString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000);

// Inspection documents keyed to the past days, for History and Statistics
const atDaysAgo = (days, hour, minute) => {
    const d = new Date(Date.now() - days * DAY_MS);
    d.setHours(hour, minute, 0, 0);
    return d;
};

// ─── Clean ────────────────────────────────────────────────────────────────

const clean = async () => {

    const users = await getCollection("users");
    const demoUsers = await users.find({ $or: [{ Demo: true }, { Email: DEMO_EMAIL }] }).toArray();
    const ids = demoUsers.map((u) => u.Id);

    const byUser = { $or: [{ Demo: true }, { UserId: { $in: ids } }] };
    const byInspector = { $or: [{ Demo: true }, { InspectorId: { $in: ids } }] };

    const results = await Promise.all([
        users.deleteMany({ Id: { $in: ids } }),
        (await getCollection("passengerAccounts")).deleteMany(byUser),
        (await getCollection("passengerTokens")).deleteMany(byUser),
        (await getCollection("journeys")).deleteMany(byUser),
        (await getCollection("bookings")).deleteMany(byUser),
        (await getCollection("notifications")).deleteMany(byUser),
        (await getCollection("schedules")).deleteMany(byInspector),
        (await getCollection("inspectorShifts")).deleteMany(byInspector),
        (await getCollection("inspections")).deleteMany(byInspector),
        (await getCollection("violations")).deleteMany(byInspector),
        (await getCollection("routes")).deleteMany({ Demo: true }),
        (await getCollection("vehicles")).deleteMany({ Demo: true })
    ]);

    const removed = results.reduce((sum, r) => sum + r.deletedCount, 0);
    console.log(`Removed ${removed} demo records.`);
};

// ─── Seed helpers ─────────────────────────────────────────────────────────

const createUser = async (email, fullName, role, passwordHash) => {
    const user = {
        Id: await nextId("users"),
        Email: email,
        PasswordHash: passwordHash,
        FullName: fullName,
        Role: role,
        Status: "Active",
        RefreshToken: null,
        CreatedAt: new Date(),
        Demo: true
    };
    await (await getCollection("users")).insertOne(user);
    return user;
};

const createRoute = async (routeNumber, routeName, start, end, stops) => {
    const route = {
        Id: await nextId("routes"),
        RouteNumber: routeNumber,
        RouteName: routeName,
        StartLocation: start,
        EndLocation: end,
        DistanceKm: stops[stops.length - 1][1],
        CurrentStatus: true,
        stops: [],
        CreatedAt: new Date(),
        Demo: true
    };
    for (const [i, [name, km]] of stops.entries()) {
        route.stops.push({ Id: await nextId("routeStops"), StopName: name, StopOrder: i + 1, DistanceFromStartKm: km });
    }
    await (await getCollection("routes")).insertOne(route);
    return route;
};

// A route the team created through the web portal (not one of our demo copies)
const findRealRoute = async (routeNumber) => {
    const route = await (await getCollection("routes")).findOne(
        { RouteNumber: routeNumber, Demo: { $ne: true }, Deleted: { $ne: 1 }, CurrentStatus: { $ne: false }, "stops.1": { $exists: true } },
        { projection: { _id: 0 } }
    );
    if (route) {
        route.stops = [...route.stops].sort((a, b) => Number(a.StopOrder) - Number(b.StopOrder));
    }
    return route;
};

// One passenger = user + wallet account + token (+ optional in-progress journey)
const createPassenger = async ({ email, fullName, balance, serial, tokenStatus = "Active", journeyOn }, passwordHash) => {

    const user = await createUser(email, fullName, "Passenger", passwordHash);

    const account = {
        Id: await nextId("passengerAccounts"),
        UserId: user.Id,
        Balance: balance,
        Currency: "LKR",
        Status: "Active",
        CreatedAt: new Date(),
        Demo: true
    };
    await (await getCollection("passengerAccounts")).insertOne(account);

    await (await getCollection("passengerTokens")).insertOne({
        Id: await nextId("passengerTokens"),
        UserId: user.Id,
        AccountId: account.Id,
        TokenSerial: serial,
        TokenType: "QR",
        Status: tokenStatus,
        ActivatedAt: minutesAgo(60 * 24 * 30),
        ExpiresAt: null,
        LastUsedAt: null,
        Demo: true
    });

    if (journeyOn) {
        const stop = journeyOn.stops[0];
        await (await getCollection("journeys")).insertOne({
            Id: await nextId("journeys"),
            UserId: user.Id,
            TokenSerial: serial,
            RouteId: journeyOn.Id,
            RouteNumber: journeyOn.RouteNumber,
            RouteName: journeyOn.RouteName,
            BoardingStop: {
                StopId: stop.Id,
                StopName: stop.StopName,
                DistanceFromStartKm: stop.DistanceFromStartKm,
                Timestamp: minutesAgo(25)
            },
            AlightingStop: null,
            DistanceKm: 0,
            FareAmount: 0,
            Status: "InProgress",
            PaidFrom: "Wallet",
            CreatedAt: minutesAgo(25),
            CompletedAt: null,
            Demo: true
        });
    }

    return user;
};

// ─── Seed ─────────────────────────────────────────────────────────────────

const seed = async () => {

    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const today = toDateString(new Date());

    // Routes and bus: reuse the REAL records when they exist, so bookings made in the
    // passenger app match the demo shift and survive re-seeding. Demo copies are only
    // created on an empty database.
    const route245 = await findRealRoute("245") || await createRoute("245", "Negombo - Colombo Fort", "Negombo", "Colombo Fort", [
        ["Negombo Bus Stand", 0], ["Kochchikade", 8.5], ["Ja-Ela", 17], ["Wattala", 26], ["Colombo Fort", 34.2]
    ]);
    const otherRoute = await findRealRoute("177") || await createRoute("177", "Kaduwela - Kolpity", "Kaduwela", "Kolpity", [
        ["Kaduwela", 0], ["Malabe", 3], ["Battaramulla", 5], ["Boralle", 8], ["Kolpity", 10]
    ]);
    console.log(`Using route 245 = #${route245.Id}${route245.Demo ? " (demo copy)" : ""}, route 177 = #${otherRoute.Id}${otherRoute.Demo ? " (demo copy)" : ""}`);

    const vehicles = await getCollection("vehicles");
    let vehicle = await vehicles.findOne({ VehicleId: "NB-1234", Demo: { $ne: true }, Deleted: { $ne: 1 } });
    if (!vehicle) {
        vehicle = { Id: await nextId("vehicles"), Depot: "Negombo", Name: "Demo Bus", Status: "Active", Type: 1,
            VehicleId: "NB-1234", Seats: 50, CreatedAt: new Date(), Demo: true };
        await vehicles.insertOne({ ...vehicle });
    }
    const vehicleId = vehicle.Id;

    const inspector = await createUser("inspector@shattle.demo", "K. Perera", "Inspector", passwordHash);

    const schedules = await getCollection("schedules");
    const todayScheduleId = await nextId("schedules");
    await schedules.insertOne({
        Id: todayScheduleId, Date: today, StartTime: "00:00", EndTime: "23:59",
        RouteId: route245.Id, VehicleId: vehicleId, InspectorId: inspector.Id,
        Status: "Confirmed", QrCode: null, CreatedAt: new Date(), Demo: true
    });
    // Real inspector accounts passed with --inspector <email>: close any shift left
    // open from an earlier day, then give them today's demo shift too
    for (const email of inspectorEmails()) {
        const user = await (await getCollection("users")).findOne({ Email: email, Role: /inspector/i, Deleted: { $ne: 1 } });
        if (!user) {
            console.warn(`No inspector account found for ${email} - skipped`);
            continue;
        }
        const closed = await (await getCollection("inspectorShifts")).updateMany(
            { InspectorId: user.Id, EndedAt: null },
            { $set: { EndedAt: new Date() } }
        );
        await schedules.insertOne({
            Id: await nextId("schedules"), Date: today, StartTime: "00:00", EndTime: "23:59",
            RouteId: route245.Id, VehicleId: vehicleId, InspectorId: user.Id,
            Status: "Confirmed", QrCode: null, CreatedAt: new Date(), Demo: true
        });
        console.log(`Shift today for ${email} (closed ${closed.modifiedCount} old open shift(s))`);
    }

    // Upcoming shifts for the Schedule screen
    for (const days of [1, 2, 4]) {
        await schedules.insertOne({
            Id: await nextId("schedules"), Date: toDateString(new Date(Date.now() + days * DAY_MS)),
            StartTime: "08:00", EndTime: "16:00", RouteId: (days === 2 ? otherRoute : route245).Id,
            VehicleId: vehicleId, InspectorId: inspector.Id, Status: "Confirmed", QrCode: null,
            CreatedAt: new Date(), Demo: true
        });
    }

    // One passenger per inspection outcome
    const scenarios = [
        { serial: "TK-DEMO-001", email: "valid@shattle.demo", fullName: "Nethum Dilchitha", balance: 1500, journeyOn: route245, expect: "VALID" },
        { serial: "TK-DEMO-002", email: "noboarding@shattle.demo", fullName: "Sachini Fernando", balance: 800, expect: "INVALID - No Boarding Scan" },
        { serial: "TK-DEMO-003", email: "wrongroute@shattle.demo", fullName: "Kasun Jayasuriya", balance: 950, journeyOn: otherRoute, expect: "INVALID - Invalid Journey (boarded route 177)" },
        { serial: "TK-DEMO-004", email: "nocredit@shattle.demo", fullName: "Dilani Wickramasinghe", balance: 0, journeyOn: route245, expect: "INVALID - Insufficient Credit" },
        { serial: "TK-DEMO-005", email: "expired@shattle.demo", fullName: "Ruwan Silva", balance: 600, tokenStatus: "Expired", expect: "INVALID - Expired Token" }
    ];
    const passengers = {};
    for (const s of scenarios) {
        passengers[s.serial] = await createPassenger(s, passwordHash);
    }

    // Past week of inspections (closed shift per day) for History, Statistics and Violations
    const past = [
        [1, 9, 15, "TK-DEMO-001", "Valid", null], [1, 10, 5, "TK-DEMO-002", "Invalid", "No Boarding Scan"],
        [1, 11, 40, "TK-DEMO-004", "Valid", null], [2, 8, 30, "TK-DEMO-001", "Valid", null],
        [2, 14, 20, "TK-DEMO-005", "Invalid", "Expired Token"], [3, 9, 50, "TK-DEMO-003", "Valid", null],
        [4, 16, 10, "TK-DEMO-003", "Invalid", "Invalid Journey"], [5, 12, 0, "TK-DEMO-001", "Valid", null],
        [6, 10, 45, "TK-DEMO-002", "Valid", null]
    ];
    const messages = {
        "No Boarding Scan": "The passenger did not scan their token when boarding",
        "Expired Token": "This token has expired",
        "Invalid Journey": "The passenger tapped in on route 177, not this bus's route"
    };
    const shifts = await getCollection("inspectorShifts");
    const inspections = await getCollection("inspections");
    const violations = await getCollection("violations");
    const shiftByDay = {};

    for (const [days, h, m, serial, result, reason] of past) {
        if (!shiftByDay[days]) {
            shiftByDay[days] = await nextId("inspectorShifts");
            await shifts.insertOne({
                Id: shiftByDay[days], InspectorId: inspector.Id, ScheduleId: todayScheduleId,
                StartedAt: atDaysAgo(days, 8, 0), EndedAt: atDaysAgo(days, 17, 0), Demo: true
            });
        }
        const inspection = {
            Id: await nextId("inspections"), InspectorId: inspector.Id, ShiftId: shiftByDay[days],
            ScheduleId: todayScheduleId, TokenSerial: serial, PassengerUserId: passengers[serial].Id,
            RouteNumber: route245.RouteNumber, RouteName: route245.RouteName, VehicleNumber: "NB-1234",
            Method: days % 2 ? "QR" : "Manual", Result: result, Reason: reason,
            Message: reason ? messages[reason] : "Ticket is valid for this journey",
            InspectedAt: atDaysAgo(days, h, m), Demo: true
        };
        // Record violations for two of the three invalid ones; leave one to record from History
        if (reason && reason !== "Invalid Journey") {
            inspection.ViolationId = await nextId("violations");
            await violations.insertOne({
                Id: inspection.ViolationId, InspectionId: inspection.Id, InspectorId: inspector.Id,
                ShiftId: inspection.ShiftId, TokenSerial: serial, PassengerUserId: inspection.PassengerUserId,
                ViolationType: reason, Location: "En Route",
                Notes: reason === "No Boarding Scan" ? "Passenger could not show a tap-in record." : "",
                RouteNumber: inspection.RouteNumber, RouteName: inspection.RouteName,
                VehicleNumber: inspection.VehicleNumber, InspectedAt: inspection.InspectedAt,
                RecordedAt: new Date(inspection.InspectedAt.getTime() + 3 * 60 * 1000), Demo: true
            });
        }
        await inspections.insertOne(inspection);
    }

    // Bookings for the Scan (tap-in / tap-out) and Validate functions
    const lowBalance = await createPassenger(
        { serial: "TK-DEMO-006", email: "lowbalance@shattle.demo", fullName: "Amaya Gunawardena", balance: 50 }, passwordHash);
    const yesterday = toDateString(new Date(Date.now() - DAY_MS));
    const bookingScenarios = [
        { serial: "TK-BK-D001", user: passengers["TK-DEMO-002"], route: route245, date: today,
          scan: "1st TAP IN, 2nd TAP OUT (LKR fare), 3rd rejected", validate: "VALID" },
        { serial: "TK-BK-D002", user: lowBalance, route: route245, date: today,
          scan: "TAP IN, then TAP OUT -> balance negative (debt)", validate: "VALID" },
        { serial: "TK-BK-D003", user: passengers["TK-DEMO-003"], route: otherRoute, date: today,
          scan: "Rejected - wrong route", validate: "INVALID - Wrong Route" },
        { serial: "TK-BK-D004", user: passengers["TK-DEMO-005"], route: route245, date: yesterday,
          scan: "Rejected - expired", validate: "INVALID - Expired" }
    ];
    const { calculateBookingFare } = require("../src/service/booking.service");
    const bookingsCol = await getCollection("bookings");
    const tokensCol = await getCollection("passengerTokens");
    for (const [i, b] of bookingScenarios.entries()) {
        const last = await bookingsCol.find({}, { projection: { Id: 1 } }).sort({ Id: -1 }).limit(1).toArray();
        const id = (last[0]?.Id || 0) + 1;
        const from = b.route.stops[0];
        const to = b.route.stops[b.route.stops.length - 2];
        const fare = await calculateBookingFare({ routeId: b.route.Id, boardingStopId: from.Id, alightingStopId: to.Id, isPeak: true, adultCount: 1, minorCount: 0 });
        b.fare = fare.fareAmount;
        await bookingsCol.insertOne({
            Id: id, BookingRef: `BK-DEMO-${i + 1}`, UserId: b.user.Id,
            RouteId: b.route.Id, RouteNumber: b.route.RouteNumber, RouteName: b.route.RouteName,
            ScheduleId: todayScheduleId, ScheduleDate: b.date, TimeSlot: "00:00 - 23:59", SlotLabel: "Standard Schedule",
            BoardingStop: { StopId: from.Id, StopName: from.StopName, DistanceFromStartKm: from.DistanceFromStartKm },
            AlightingStop: { StopId: to.Id, StopName: to.StopName, DistanceFromStartKm: to.DistanceFromStartKm },
            DistanceKm: fare.distanceKm, AdultCount: 1, MinorCount: 0, PassengerCount: 1, PassengerType: "Adult",
            AdultFareUnit: fare.adultFareUnit, MinorFareUnit: fare.minorFareUnit, FareAmount: fare.fareAmount,
            PaymentStatus: "PendingTapOut", IsPeak: true, PassType: "QR", TokenSerial: b.serial, TokenStatus: "Active",
            QrPayload: JSON.stringify({ bookingToken: b.serial, userId: b.user.Id }), Status: "Booked",
            CreatedAt: new Date().toISOString(), UpdatedAt: new Date().toISOString(), Demo: true
        });
        await tokensCol.insertOne({
            TokenSerial: b.serial, UserId: b.user.Id, TokenType: "QR", Status: "Active", BookingId: id,
            BookingRef: `BK-DEMO-${i + 1}`, IsBookingToken: true, CreatedAt: new Date().toISOString(), Demo: true
        });
    }

    // Printable QR codes (plain serials, which the inspector app accepts and which never expire)
    const qrDir = path.join(__dirname, "demo-qr");
    fs.mkdirSync(qrDir, { recursive: true });
    const tiles = [];
    for (const s of [
        ...scenarios.map((x) => ({ ...x, expect: `Inspect: ${x.expect}` })),
        { serial: "TK-DEMO-999", expect: "Inspect: INVALID - Invalid Token (not registered)" },
        ...bookingScenarios.map((b) => ({ serial: b.serial, expect: `Scan: ${b.scan}<br>Validate: ${b.validate}` }))
    ]) {
        const dataUrl = await QRCode.toDataURL(s.serial, { width: 260, margin: 2 });
        tiles.push(`<figure><img src="${dataUrl}" alt="${s.serial}"><figcaption><b>${s.serial}</b><br>${s.expect}</figcaption></figure>`);
    }
    fs.writeFileSync(path.join(qrDir, "index.html"),
        `<!doctype html><meta charset="utf-8"><title>Shattle demo QR codes</title>
<style>body{font-family:system-ui,sans-serif;margin:24px}main{display:flex;flex-wrap:wrap;gap:24px}
figure{margin:0;text-align:center;width:260px}figcaption{font-size:14px;line-height:1.4}</style>
<h1>Shattle inspector demo QR codes (${today})</h1><main>${tiles.join("")}</main>`);

    // Summary
    console.log(`\nDemo data ready for ${today}. Password for every account: ${PASSWORD}\n`);
    console.log(`Inspector login : inspector@shattle.demo  (shift today: Route 245 Negombo - Colombo Fort, bus NB-1234)`);
    console.table(scenarios.map((s) => ({ token: s.serial, passenger: s.email, balance: s.balance, "expected result": s.expect })));
    console.log("TK-DEMO-999 (unregistered) -> INVALID - Invalid Token");
    console.log("\nBookings for Scan / Validate:");
    console.table(bookingScenarios.map((b) => ({ token: b.serial, passenger: b.user.Email, fare: b.fare, scan: b.scan, validate: b.validate })));
    console.log(`\nQR codes to scan: ${path.join(qrDir, "index.html")}`);
};

// ─── Run ──────────────────────────────────────────────────────────────────

(async () => {
    try {
        await clean();
        if (!process.argv.includes("--clean")) {
            await seed();
        }
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        await close();
    }
})();
