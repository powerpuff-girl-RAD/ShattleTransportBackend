const { getCollection, nextId, NO_ID } = require("../config/database");

const records = () => getCollection("healthRecords");


// GET ALL
const getAll = async () => {
    return (await records()).find({ Deleted: { $ne: 1 } }, NO_ID).sort({ Id: 1 }).toArray();
};


// GET BY ID
const getById = async (id) => {
    return (await records()).findOne({ Id: Number(id), Deleted: { $ne: 1 } }, NO_ID);
};


// CREATE
const create = async (data) => {
    const record = {
        Id: await nextId("healthRecords"),
        PatientName: data.patientName,
        Status: data.status,
        Description: data.description || null,
        CreatedAt: new Date()
    };

    await (await records()).insertOne({ ...record });

    return record;
};


// UPDATE
const update = async (id, data) => {
    return (await records()).findOneAndUpdate(
        { Id: Number(id), Deleted: { $ne: 1 } },
        {
            $set: {
                PatientName: data.patientName,
                Status: data.status,
                Description: data.description || null
            }
        },
        { ...NO_ID, returnDocument: "after" }
    );
};


// DELETE
const remove = async (id) => {
    // Soft delete
    return (await records()).findOneAndUpdate(
        { Id: Number(id), Deleted: { $ne: 1 } },
        { $set: { Deleted: 1, DeletedAt: new Date() } },
        NO_ID
    );
};


module.exports = {
    getAll,
    getById,
    create,
    update,
    remove
};
