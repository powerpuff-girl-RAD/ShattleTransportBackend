const { getCollection } = require('../config/database');

const NO_ID = { projection: { _id: 0 } };

/**
 * Creates a new booking record.
 */
const createBooking = async (bookingData) => {
    const bookingsCol = await getCollection('bookings');

    // Generate unique sequential Id
    const lastBooking = await bookingsCol.find({}, { projection: { Id: 1, _id: 0 } })
        .sort({ Id: -1 })
        .limit(1)
        .toArray();
    const newId = lastBooking.length > 0 ? Number(lastBooking[0].Id || 0) + 1 : 1;

    const doc = {
        Id: newId,
        ...bookingData,
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
    };

    await bookingsCol.insertOne(doc);
    return await bookingsCol.findOne({ Id: newId }, NO_ID);
};

/**
 * Retrieves all bookings for a user.
 */
const getUserBookings = async (userId, limit = 50) => {
    const bookingsCol = await getCollection('bookings');
    return await bookingsCol
        .find({ UserId: Number(userId) }, NO_ID)
        .sort({ CreatedAt: -1 })
        .limit(Number(limit))
        .toArray();
};

/**
 * Retrieves a single booking by Id.
 */
const getBookingById = async (id, userId = null) => {
    const bookingsCol = await getCollection('bookings');
    const query = { Id: Number(id) };
    if (userId) query.UserId = Number(userId);
    return await bookingsCol.findOne(query, NO_ID);
};

/**
 * Retrieves a booking by Booking Reference string.
 */
const getBookingByRef = async (bookingRef) => {
    const bookingsCol = await getCollection('bookings');
    return await bookingsCol.findOne({ BookingRef: bookingRef }, NO_ID);
};

/**
 * Retrieves a booking by Token Serial.
 */
const getBookingByTokenSerial = async (tokenSerial) => {
    const bookingsCol = await getCollection('bookings');
    return await bookingsCol.findOne({ TokenSerial: tokenSerial }, NO_ID);
};

/**
 * Updates a booking by Id.
 */
const updateBooking = async (id, updateFields) => {
    const bookingsCol = await getCollection('bookings');
    const res = await bookingsCol.findOneAndUpdate(
        { Id: Number(id) },
        {
            $set: {
                ...updateFields,
                UpdatedAt: new Date().toISOString(),
            },
        },
        { ...NO_ID, returnDocument: 'after' }
    );
    return res;
};

module.exports = {
    createBooking,
    getUserBookings,
    getBookingById,
    getBookingByRef,
    getBookingByTokenSerial,
    updateBooking,
};