const { getCollection, nextId, NO_ID } = require('../config/database');

const notifications = () => getCollection('notifications');

/**
 * Creates and logs a notification for a passenger.
 */
const createNotification = async ({ userId, type, title, message, data = {} }) => {
    const doc = {
        Id: await nextId('notifications'),
        UserId: Number(userId),
        Type: type,
        Title: title,
        Message: message,
        Data: data,
        IsRead: false,
        CreatedAt: new Date(),
    };

    await (await notifications()).insertOne({ ...doc });
    return doc;
};

/**
 * Retrieves the passenger's recent notifications.
 */
const getUserNotifications = async (userId, limit = 20) => {
    return (await notifications())
        .find({ UserId: Number(userId) }, NO_ID)
        .sort({ CreatedAt: -1 })
        .limit(Number(limit))
        .toArray();
};

/**
 * Marks a notification as read.
 */
const markAsRead = async (id, userId) => {
    const res = await (await notifications()).updateOne(
        { Id: Number(id), UserId: Number(userId) },
        { $set: { IsRead: true, ReadAt: new Date() } }
    );
    return res.matchedCount > 0;
};

module.exports = {
    createNotification,
    getUserNotifications,
    markAsRead,
};