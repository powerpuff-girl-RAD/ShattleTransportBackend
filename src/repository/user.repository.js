const { getCollection, NO_ID } = require("../config/database");

const users = () => getCollection("users");

const PUBLIC_FIELDS = { _id: 0, PasswordHash: 0, RefreshToken: 0 };

const withStatusName = (user) => (user ? { ...user, StatusName: user.Status } : null);


// GET ALL
const getAll = async () => {
    const rows = await (await users()).find({ Deleted: { $ne: 1 } }, { projection: PUBLIC_FIELDS }).sort({ Id: 1 }).toArray();
    return rows.map(withStatusName);
};


// UPDATE
const update = async (id, { email, fullName, role, status }) => {
    const changes = { Email: email };

    if (fullName) changes.FullName = fullName;
    if (role) changes.Role = role;
    if (status) changes.Status = status;

    const updated = await (await users()).findOneAndUpdate(
        { Id: Number(id), Deleted: { $ne: 1 } },
        { $set: changes },
        { projection: PUBLIC_FIELDS, returnDocument: "after" }
    );

    return withStatusName(updated);
};


// DELETE
const remove = async (id) => {
    // Soft delete
    await (await users()).updateOne(
        { Id: Number(id), Deleted: { $ne: 1 } },
        { $set: { Deleted: 1, DeletedAt: new Date(), RefreshToken: null } }
    );
};


module.exports = {
    getAll,
    update,
    remove
};
