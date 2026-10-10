const dns = require("dns");
const { MongoClient } = require("mongodb");

// Some networks block Node's SRV lookups for mongodb+srv URIs; allow overriding DNS servers.
if (process.env.MONGO_DNS_SERVERS) {
    dns.setServers(process.env.MONGO_DNS_SERVERS.split(",").map((s) => s.trim()));
}

const DEFAULT_DB_NAME = "shattleTransport";

// SQL Server compared emails case-insensitively; keep that behaviour
const EMAIL_COLLATION = { locale: "en", strength: 2 };

let client;
let db;
let connecting;

const ensureIndexes = async (database) => {
    await Promise.all([
        database.collection("users").createIndex({ Id: 1 }, { unique: true }),
        database.collection("users").createIndex({ Email: 1 }, { unique: true, collation: EMAIL_COLLATION }),
        database.collection("routes").createIndex({ Id: 1 }, { unique: true }),
        database.collection("vehicles").createIndex({ Id: 1 }, { unique: true }),
        database.collection("schedules").createIndex({ Id: 1 }, { unique: true }),
        database.collection("passengerAccounts").createIndex({ UserId: 1 }, { unique: true }),
        database.collection("passengerTokens").createIndex({ TokenSerial: 1 }, { unique: true }),
        database.collection("passengerTopUps").createIndex({ TransactionRef: 1 }, { unique: true }),
        database.collection("passengerTopUps").createIndex({ UserId: 1, CreatedAt: -1 }),
        database.collection("journeys").createIndex({ Id: 1 }, { unique: true }),
        database.collection("journeys").createIndex({ UserId: 1, Status: 1 }),
        database.collection("notifications").createIndex({ Id: 1 }, { unique: true }),
        database.collection("notifications").createIndex({ UserId: 1, CreatedAt: -1 }),
        database.collection("bookings").createIndex({ Id: 1 }, { unique: true }),
        database.collection("bookings").createIndex({ BookingRef: 1 }, { unique: true }),
        database.collection("bookings").createIndex({ UserId: 1, CreatedAt: -1 }),
        database.collection("bookings").createIndex({ TokenSerial: 1 })
    ]);
};

const connect = async () => {
    const uri = process.env.MONGO_URI;

    if (!uri) {
        throw new Error("MONGO_URI is not set in the environment");
    }

    client = new MongoClient(uri);

    try {
        await client.connect();

        db = client.db(process.env.MONGO_DB_NAME || DEFAULT_DB_NAME);

        await ensureIndexes(db);

        console.log(`Connected to MongoDB (${db.databaseName})`);

        return db;
    } catch (error) {
        console.error("MongoDB connection failed:");
        console.error(error);

        await client.close().catch(() => {});
        client = undefined;

        throw error;
    }
};

const getDb = async () => {
    if (db) {
        return db;
    }

    if (!connecting) {
        connecting = connect().finally(() => {
            connecting = undefined;
        });
    }

    return connecting;
};

const getCollection = async (name) => (await getDb()).collection(name);

// Auto-increment integer ids (keeps the numeric ids the API and JWTs already use)
const nextId = async (sequenceName) => {
    const counters = await getCollection("counters");

    const counter = await counters.findOneAndUpdate(
        { _id: sequenceName },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" }
    );

    return counter.seq;
};

// Strips Mongo's internal _id so rows look like the previous SQL rows
const NO_ID = { projection: { _id: 0 } };

const close = async () => {
    if (client) {
        await client.close();
        client = undefined;
        db = undefined;
    }
};

module.exports = {
    EMAIL_COLLATION,
    getDb,
    getCollection,
    nextId,
    close,
    NO_ID
};
