const scheduleRepository = require("../repository/schedule.repository");
const scheduleFacade = require("./schedule.facade");
const { notFound } = require("../utils/errors");


const getAllSchedules = async () => {

    return await scheduleRepository.getAll();
};

const getScheduleById = async (id) => {

    const schedule = await scheduleRepository.getbyId(id);

    if (!schedule || schedule.length === 0) {

        throw notFound("Schedule not found");
    }

    return schedule[0];
};

// ASSIGN (create)
const assignSchedule = async (data) => {

    return await scheduleFacade.assign(data);
};

const updateSchedule = async (id, data) => {

    return await scheduleFacade.update(id, data);
};

const removeSchedule = async (id) => {

    const schedule = await scheduleRepository.remove(id);

    if (!schedule) {

        throw notFound("Schedule not found");
    }
};


module.exports = {
    getAllSchedules,
    getScheduleById,
    assignSchedule,
    updateSchedule,
    removeSchedule
};
