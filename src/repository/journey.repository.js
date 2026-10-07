const { getCollection, nextId, NO_ID } = require('../config/database');

const journeys = () => getCollection('journeys');

/**
 * Starts a new journey for a passenger.
 */
const startJourney = async ({
    userId,
    tokenSerial,
    routeId,
    routeNumber,
    routeName,
    boardingStop,
}) => {
    const existing = await (await journeys()).findOne({
        UserId: Number(userId),
        Status: 'InProgress',
    }, NO_ID);

    if (existing) {
        const error = new Error('A journey is already in progress for this passenger. Please alight (tap out) first.');
        error.statusCode = 400;
        throw error;
    }

    const doc = {
        Id: await nextId('journeys'),
        UserId: Number(userId),
        TokenSerial: tokenSerial,
        RouteId: Number(routeId),
        RouteNumber: routeNumber || '',
        RouteName: routeName || '',
        BoardingStop: {
            StopId: boardingStop.stopId,
            StopName: boardingStop.stopName,
            DistanceFromStartKm: Number(boardingStop.distanceFromStartKm ?? 0),
            Timestamp: new Date(),
        },
        AlightingStop: null,
        DistanceKm: 0,
        FareAmount: 0,
        Status: 'InProgress',
        PaidFrom: 'Wallet',
        CreatedAt: new Date(),
        CompletedAt: null,
    };

    await (await journeys()).insertOne({ ...doc });
    return doc;
};

/**
 * Gets currently active (InProgress) journey for a user.
 */
const getActiveJourney = async (userId) => {
    return (await journeys()).findOne(
        { UserId: Number(userId), Status: 'InProgress' },
        NO_ID
    );
};

/**
 * Ends a journey with alighting details, distance, and deducted fare.
 */
const endJourney = async ({
    journeyId,
    userId,
    alightingStop,
    distanceKm,
    fareAmount,
}) => {
    const update = {
        AlightingStop: {
            StopId: alightingStop.stopId,
            StopName: alightingStop.stopName,
            DistanceFromStartKm: Number(alightingStop.distanceFromStartKm ?? 0),
            Timestamp: new Date(),
        },
        DistanceKm: Number(distanceKm),
        FareAmount: Number(fareAmount),
        Status: 'Completed',
        CompletedAt: new Date(),
    };

    const res = await (await journeys()).findOneAndUpdate(
        { Id: Number(journeyId), UserId: Number(userId), Status: 'InProgress' },
        { $set: update },
        { ...NO_ID, returnDocument: 'after' }
    );

    return res;
};

/**
 * Retrieves journey history for a passenger.
 */
const getPassengerJourneys = async (userId, limit = 20) => {
    return (await journeys())
        .find({ UserId: Number(userId) }, NO_ID)
        .sort({ CreatedAt: -1 })
        .limit(Number(limit))
        .toArray();
};

/**
 * Retrieves a single journey by ID.
 */
const getJourneyById = async (id) => {
    return (await journeys()).findOne({ Id: Number(id) }, NO_ID);
};

module.exports = {
    startJourney,
    getActiveJourney,
    endJourney,
    getPassengerJourneys,
    getJourneyById,
};