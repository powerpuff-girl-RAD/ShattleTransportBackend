const { getCollection, nextId, NO_ID } = require("../config/database");

const distanceFares = () => getCollection("fareDistance");
const flatFares = () => getCollection("fareFlat");
const timeBasedFares = () => getCollection("fareTimeBased");
const farePasses = () => getCollection("farePasses");

const DEFAULT_FLAT_FARES = [
    {
        PassengerType: "Adult",
        PassengerDescription: "Ages 18-59",
        Local: 150,
        Express: 200,
        Rule: "BASE",
        Status: "Active"
    },
    {
        PassengerType: "Student",
        PassengerDescription: "Valid student ID",
        Local: 75,
        Express: 100,
        Rule: "50% OFF",
        Status: "Active"
    },
    {
        PassengerType: "Child",
        PassengerDescription: "Ages 5-17",
        Local: 75,
        Express: 100,
        Rule: "50% OFF",
        Status: "Active"
    },
    {
        PassengerType: "Senior",
        PassengerDescription: "Ages 60+",
        Local: 100,
        Express: 140,
        Rule: "33% OFF",
        Status: "Active"
    }
];

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

const createDefaultFlatFares = async (routeId) => {
    const rows = [];

    for (const fare of DEFAULT_FLAT_FARES) {
        rows.push({
            Id: await nextId("fareFlat"),
            RouteId: Number(routeId),
            ...fare,
            CreatedAt: new Date()
        });
    }

    await (await flatFares()).insertMany(rows.map((row) => ({ ...row })));

    return rows;
};

// Updates supplied fare ids and inserts new fares; removes inserted fares if a later step fails
const createBundle = async (payload) => {
    const { routeId } = payload;
    const inserted = [];

    const saveAll = async (collection, sequence, items, mapItem) => {
        if (items.length === 0) {
            return;
        }

        const target = await collection();
        const docsToInsert = [];

        for (const item of items) {
            const fields = mapItem(item);

            if (item.Id !== undefined) {
                const createdAt = new Date();
                const result = await target.updateOne(
                    { Id: { $in: [item.Id, String(item.Id)] }, RouteId: routeId },
                    {
                        $set: fields,
                        $setOnInsert: {
                            Id: item.Id,
                            RouteId: routeId,
                            CreatedAt: createdAt
                        }
                    },
                    { upsert: true }
                );

                await (await getCollection("counters")).updateOne(
                    { _id: sequence },
                    { $max: { seq: item.Id } },
                    { upsert: true }
                );

                if (result.upsertedCount > 0) {
                    inserted.push({ target, routeId, ids: [item.Id] });
                }
            } else {
                docsToInsert.push({
                    Id: await nextId(sequence),
                    RouteId: routeId,
                    ...fields,
                    CreatedAt: new Date()
                });
            }
        }

        if (docsToInsert.length > 0) {
            await target.insertMany(docsToInsert.map((doc) => ({ ...doc })));

            inserted.push({ target, routeId, ids: docsToInsert.map((doc) => doc.Id) });
        }
    };

    try {
        await saveAll(distanceFares, "fareDistance", payload.distanceFare, (fare) => ({
            Minkm: fare.minkm,
            Maxkm: fare.maxkm,
            StandardFare: fare.standardFare,
            OffPeakFare: fare.offPeakFare
        }));

        await saveAll(flatFares, "fareFlat", payload.flatFares, (fare) => ({
            PassengerType: fare.passengerType,
            PassengerDescription: fare.passengerDescription,
            Local: fare.local,
            Express: fare.express,
            Rule: fare.rule,
            Status: fare.status
        }));

        await saveAll(timeBasedFares, "fareTimeBased", payload.timeBasedFares, (fare) => ({
            Period: fare.period,
            StartWindow: fare.startWindow,
            EndWindow: fare.endWindow,
            AppliesFrom: fare.appliesFrom,
            AppliesTo: fare.appliesTo,
            FareRule: fare.fareRule,
            Status: fare.status
        }));

        await saveAll(farePasses, "farePasses", payload.passes, (pass) => ({
            PassProduct: pass.passProduct,
            Tagline: pass.tagline,
            Price: pass.price,
            Validity: pass.validity,
            UsageCondition: pass.usageCondition,
            IsOn: pass.isOn
        }));
    } catch (error) {
        await Promise.allSettled(inserted.map(({ target, routeId, ids }) =>
            target.deleteMany({ Id: { $in: ids }, RouteId: routeId })
        ));

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
    createDefaultFlatFares,
    createBundle,
    update
};
