const { getCollection, nextId, NO_ID } = require("../config/database");

const schedules = () => getCollection("schedules");

const getAll = async () => {
    return getSchedule(-1);
};

const getbyId = async (id) => {
    return getSchedule(id);
};

// id -1 returns every schedule; route, vehicle and inspector names are joined in
const getSchedule = async (id) => {

    const match = Number(id) === -1 ? { Deleted: { $ne: 1 } } : { Id: Number(id), Deleted: { $ne: 1 } };

    return (await schedules()).aggregate([
        { $match: match },
        { $sort: { Id: 1 } },
        { $lookup: { from: "routes", localField: "RouteId", foreignField: "Id", as: "route" } },
        { $lookup: { from: "vehicles", localField: "VehicleId", foreignField: "Id", as: "vehicle" } },
        { $lookup: { from: "users", localField: "InspectorId", foreignField: "Id", as: "inspector" } },
        {
            $addFields: {
                RouteName: { $first: "$route.RouteName" },
                VehicleName: { $first: "$vehicle.Name" },
                Inspector: { $first: "$inspector.FullName" }
            }
        },
        { $project: { _id: 0, route: 0, vehicle: 0, inspector: 0 } }
    ]).toArray();
};

const toDocument = ({ date, startTime, endTime, routeId, vehicleId, inspectorId, status }) => ({
    Date: date,
    StartTime: startTime,
    EndTime: endTime,
    RouteId: Number(routeId),
    VehicleId: Number(vehicleId),
    InspectorId: Number(inspectorId),
    Status: status
});


// CREATE (assign a schedule)
const create = async (data) => {

    const id = await nextId("schedules");

    await (await schedules()).insertOne({
        Id: id,
        ...toDocument(data),
        QrCode: null,
        CreatedAt: new Date()
    });

    return id;
};

const saveQrCode = async (id, qrCode) => {

    await (await schedules()).updateOne({ Id: Number(id), Deleted: { $ne: 1 } }, { $set: { QrCode: qrCode } });

    return getbyId(id);
};


const update = async (id, data) => {

    await (await schedules()).updateOne({ Id: Number(id), Deleted: { $ne: 1 } }, { $set: toDocument(data) });

    return getbyId(id);
};


const remove = async (id) => {

    // Soft delete
    return (await schedules()).findOneAndUpdate(
        { Id: Number(id), Deleted: { $ne: 1 } },
        { $set: { Deleted: 1, DeletedAt: new Date() } },
        NO_ID
    );
};


module.exports = {
    getAll,
    getbyId,
    create,
    saveQrCode,
    update,
    remove
};
