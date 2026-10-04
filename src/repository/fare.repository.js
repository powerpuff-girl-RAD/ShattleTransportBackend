const { getCollection, nextId, NO_ID } = require("../config/database");

const distanceFares = () => getCollection("fareDistance");
const flatFares = () => getCollection("fareFlat");
const timeBasedFares = () => getCollection("fareTimeBased");
const farePasses = () => getCollection("farePasses");

const routeFilter = (routeId) => {
    const parsed = Number(routeId);

    return routeId === undefined || routeId === null || routeId === "" || !Number.isFinite(parsed)
        ? {}
        : { RouteId: parsed };
};

const list = async (collection, filter) => {
    return (await collection()).find(filter, NO_ID).sort({ Id: 1 }).toArray();
};

const getAll = async (routeId) => {
    const filter = routeFilter(routeId);

    const [farePass, distanceFare, flatFare, timeBasedFare] = await Promise.all([
        list(farePasses, filter),
        list(distanceFares, filter),
        list(flatFares, filter),
        list(timeBasedFares, filter)
    ]);

    return {
        farePass,
        distanceFare,
        flatFare,
        timeBasedFare: timeBasedFare.map((fare) => ({
            ...fare,
            Window: `${fare.StartWindow} - ${fare.EndWindow}`,
            Applies: fare.AppliesFrom === "ALL" ? "ALL DAYS" : `${fare.AppliesFrom} - ${fare.AppliesTo}`
        }))
    };
};

const toDistanceDocument = ({ routeId, minkm, maxkm, standardFare, offPeakFare }) => ({
    RouteId: routeId,
    Minkm: minkm,
    Maxkm: maxkm,
    StandardFare: standardFare,
    OffPeakFare: offPeakFare
});

const create = async (fare) => {
    const row = { Id: await nextId("fareDistance"), ...toDistanceDocument(fare), CreatedAt: new Date() };

    await (await distanceFares()).insertOne({ ...row });

    return row;
};

// Inserts every fare collection for a route; removes what was inserted if any step fails
const createBundle = async (payload) => {
    const { routeId } = payload;
    const inserted = [];

    const insertAll = async (collection, sequence, items, mapItem) => {
        if (items.length === 0) {
            return;
        }

        const docs = [];

        for (const item of items) {
            docs.push({ Id: await nextId(sequence), RouteId: routeId, ...mapItem(item), CreatedAt: new Date() });
        }

        const target = await collection();

        await target.insertMany(docs.map((doc) => ({ ...doc })));

        inserted.push({ target, ids: docs.map((doc) => doc.Id) });
    };

    try {
        await insertAll(distanceFares, "fareDistance", payload.distanceFare, (fare) => ({
            Minkm: fare.minkm,
            Maxkm: fare.maxkm,
            StandardFare: fare.standardFare,
            OffPeakFare: fare.offPeakFare
        }));

        await insertAll(flatFares, "fareFlat", payload.flatFares, (fare) => ({
            PassengerType: fare.passengerType,
            PassengerDescription: fare.passengerDescription,
            Local: fare.local,
            Express: fare.express,
            Rule: fare.rule,
            Status: fare.status
        }));

        await insertAll(timeBasedFares, "fareTimeBased", payload.timeBasedFares, (fare) => ({
            Period: fare.period,
            StartWindow: fare.startWindow,
            EndWindow: fare.endWindow,
            AppliesFrom: fare.appliesFrom,
            AppliesTo: fare.appliesTo,
            FareRule: fare.fareRule,
            Status: fare.status
        }));

        await insertAll(farePasses, "farePasses", payload.passes, (pass) => ({
            PassProduct: pass.passProduct,
            Tagline: pass.tagline,
            Price: pass.price,
            Validity: pass.validity,
            UsageCondition: pass.usageCondition,
            IsOn: pass.isOn
        }));
    } catch (error) {
        await Promise.allSettled(inserted.map(({ target, ids }) => target.deleteMany({ Id: { $in: ids } })));

        throw error;
    }

    return getAll(routeId);
};

const update = async (id, fare) => {
    return (await distanceFares()).findOneAndUpdate(
        { Id: Number(id) },
        { $set: toDistanceDocument(fare) },
        { ...NO_ID, returnDocument: "after" }
    );
};

module.exports = {
    getAll,
    create,
    createBundle,
    update
};
