const scheduleService = require("../service/schedule.service");


// GET /api/schedules
const getAll = async (req, res, next) => {

    try {

        const schedules = await scheduleService.getAllSchedules();

        res.status(200).json({
            success: true,
            data: schedules
        });

    } catch (error) {

        next(error);
    }
};

// GET /api/schedules/:id
const getById = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        const schedule = await scheduleService.getScheduleById(id);

        res.status(200).json({
            success: true,
            data: schedule
        });

    } catch (error) {

        next(error);
    }
};


// POST /api/schedules
const assign = async (req, res, next) => {

    try {

        const schedule = await scheduleService.assignSchedule(req.body);

        res.status(201).json({
            success: true,
            message: "Schedule assigned successfully",
            data: schedule
        });

    } catch (error) {

        next(error);
    }
};


// PUT /api/schedules/:id
const update = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        const schedule = await scheduleService.updateSchedule(id, req.body);

        res.status(200).json({
            success: true,
            message: "Schedule updated successfully",
            data: schedule
        });

    } catch (error) {

        next(error);
    }
};


// DELETE /api/schedules/:id
const remove = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        await scheduleService.removeSchedule(id);

        res.status(200).json({
            success: true,
            message: "Schedule removed successfully"
        });

    } catch (error) {

        next(error);
    }
};


module.exports = {
    getAll,
    getById,
    assign,
    update,
    remove
};
