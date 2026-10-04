const { getCollection, nextId, EMAIL_COLLATION, NO_ID } = require("../config/database");

const users = () => getCollection("users");

const findByEmail = async (email) => {
    return (await users()).findOne({ Email: email, Deleted: { $ne: 1 } }, { ...NO_ID, collation: EMAIL_COLLATION });
};

const findById = async (id) => {
    return (await users()).findOne({ Id: Number(id), Deleted: { $ne: 1 } }, NO_ID);
};

const createUser = async ({ email, passwordHash, fullName, role }) => {
    const user = {
        Id: await nextId("users"),
        Email: email,
        PasswordHash: passwordHash,
        FullName: fullName || null,
        Role: role || null,
        Status: "Active",
        RefreshToken: null,
        CreatedAt: new Date()
    };

    await (await users()).insertOne({ ...user });

    return user;
};

const updateRefreshToken = async (id, refreshToken) => {
    await (await users()).updateOne({ Id: Number(id) }, { $set: { RefreshToken: refreshToken } });
};

module.exports = {
    findByEmail,
    findById,
    createUser,
    updateRefreshToken
};
