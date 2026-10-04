const { getCollection, nextId, NO_ID } = require("../config/database");

const vehicles = () => getCollection("vehicles");

// Seat is stored once; Seats is exposed too because update payloads use that name
const toRow = (vehicle) => {
    const seats = vehicle.Seats ?? vehicle.Seat;
    return { ...vehicle, Seats: seats, Seat: seats };
};


const getAll = async () => {
    return getVehicle(-1);
};

const getbyId = async (id) => {
    return getVehicle(id);
};

// id -1 returns every vehicle
const getVehicle = async (id) => {
    const filter = Number(id) === -1 ? { Deleted: { $ne: 1 } } : { Id: Number(id), Deleted: { $ne: 1 } };
    const rows = await (await vehicles()).find(filter, NO_ID).sort({ Id: 1 }).toArray();
    return rows.map(toRow);
};


const create = async ({ depot, name, status, type, vehicleId, seat, seats }) => {

    const id = await nextId("vehicles");

    await (await vehicles()).insertOne({
        Id: id,
        Depot: depot,
        Name: name,
        Status: status,
        Type: Number(type),
        VehicleId: vehicleId,
        Seats: Number(seats ?? seat),
        CreatedAt: new Date()
    });

    return getbyId(id);
};


const update = async (id, { depot, name, status, type, vehicleId, seats }) => {

    await (await vehicles()).updateOne(
        { Id: Number(id), Deleted: { $ne: 1 } },
        {
            $set: {
                Depot: depot,
                Name: name,
                Status: status,
                Type: Number(type),
                VehicleId: vehicleId,
                Seats: Number(seats)
            }
        }
    );

    return getbyId(id);
};


const remove = async (id) => {

    // Soft delete
    return (await vehicles()).findOneAndUpdate(
        { Id: Number(id), Deleted: { $ne: 1 } },
        { $set: { Deleted: 1, DeletedAt: new Date() } },
        NO_ID
    );
};


module.exports = {
    getAll,
    getbyId,
    create,
    update,
    remove
};
