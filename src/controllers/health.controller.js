const healthService =
    require("../service/health.service");


// GET /api/health
const getAll = async (req, res, next) => {

    try {

        const records =
            await healthService.getAllHealthRecords();

        res.status(200).json({
            success: true,
            data: records
        });

    } catch (error) {

        next(error);
    }
};


// GET /api/health/:id
const getById = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        const record =
            await healthService.getHealthRecordById(id);

        res.status(200).json({
            success: true,
            data: record
        });

    } catch (error) {

        next(error);
    }
};


// POST /api/health
const create = async (req, res, next) => {

    try {

        const record =
            await healthService.createHealthRecord(
                req.body
            );

        res.status(201).json({
            success: true,
            message: "Health record created successfully",
            data: record
        });

    } catch (error) {

        next(error);
    }
};


// PUT /api/health/:id
const update = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        const record =
            await healthService.updateHealthRecord(
                id,
                req.body
            );

        res.status(200).json({
            success: true,
            message: "Health record updated successfully",
            data: record
        });

    } catch (error) {

        next(error);
    }
};


// DELETE /api/health/:id
const remove = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        await healthService.deleteHealthRecord(id);

        res.status(200).json({
            success: true,
            message: "Health record deleted successfully"
        });

    } catch (error) {

        next(error);
    }
};


module.exports = {
    getAll,
    getById,
    create,
    update,
    remove
};