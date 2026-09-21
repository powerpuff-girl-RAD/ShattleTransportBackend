const healthRepository = require("../repository/health.repository");


// GET ALL
const getAllHealthRecords = async () => {

    return await healthRepository.getAll();
};


// GET BY ID
const getHealthRecordById = async (id) => {

    const record = await healthRepository.getById(id);

    if (!record) {

        const error = new Error(
            "Health record not found"
        );

        error.statusCode = 404;

        throw error;
    }

    return record;
};


// CREATE
const createHealthRecord = async (data) => {

    if (!data.patientName) {

        const error = new Error(
            "Patient name is required"
        );

        error.statusCode = 400;

        throw error;
    }

    if (!data.status) {

        const error = new Error(
            "Status is required"
        );

        error.statusCode = 400;

        throw error;
    }

    return await healthRepository.create(data);
};


// UPDATE
const updateHealthRecord = async (id, data) => {

    const existingRecord =
        await healthRepository.getById(id);

    if (!existingRecord) {

        const error = new Error(
            "Health record not found"
        );

        error.statusCode = 404;

        throw error;
    }

    if (!data.patientName) {

        const error = new Error(
            "Patient name is required"
        );

        error.statusCode = 400;

        throw error;
    }

    if (!data.status) {

        const error = new Error(
            "Status is required"
        );

        error.statusCode = 400;

        throw error;
    }

    return await healthRepository.update(
        id,
        data
    );
};


// DELETE
const deleteHealthRecord = async (id) => {

    const existingRecord =
        await healthRepository.getById(id);

    if (!existingRecord) {

        const error = new Error(
            "Health record not found"
        );

        error.statusCode = 404;

        throw error;
    }

    await healthRepository.remove(id);
};


module.exports = {
    getAllHealthRecords,
    getHealthRecordById,
    createHealthRecord,
    updateHealthRecord,
    deleteHealthRecord
};