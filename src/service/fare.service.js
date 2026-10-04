const fareRepository = require("../repository/fare.repository");
const fareStrategies = require("./fare/strategies");
const { badRequest, notFound } = require("../utils/errors");
const { validateRouteId } = require("../utils/validators");

const validateFare = (data) => {
    const { routeId, minkm, maxkm, standardFare, offPeakFare } = data;
    const parsedRouteId = validateRouteId(routeId);

    if (minkm === undefined || minkm === null || minkm === "" || !Number.isFinite(Number(minkm)) || Number(minkm) < 0) {
        throw badRequest("minkm is required and must be a non-negative number");
    }

    if (standardFare === undefined || standardFare === null || standardFare === "" || !Number.isFinite(Number(standardFare)) || Number(standardFare) < 0) {
        throw badRequest("standardFare is required and must be a non-negative number");
    }

    const parsedMinkm = Number(minkm);
    const parsedStandardFare = Number(standardFare);
    const parsedMaxkm = maxkm === undefined || maxkm === null || maxkm === "" ? null : Number(maxkm);
    const parsedOffPeakFare = offPeakFare === undefined || offPeakFare === null || offPeakFare === "" ? null : Number(offPeakFare);

    if (parsedMaxkm !== null && (!Number.isFinite(parsedMaxkm) || parsedMaxkm <= parsedMinkm)) {
        throw badRequest("maxkm must be a number greater than minkm");
    }

    if (parsedOffPeakFare !== null && (!Number.isFinite(parsedOffPeakFare) || parsedOffPeakFare < 0)) {
        throw badRequest("offPeakFare must be a non-negative number or null");
    }

    return {
        routeId: parsedRouteId,
        minkm: parsedMinkm,
        maxkm: parsedMaxkm,
        standardFare: parsedStandardFare,
        offPeakFare: parsedOffPeakFare
    };
};

const validateFareBundle = (data) => {
    const routeId = validateRouteId(data.routeId);

    for (const { collection } of fareStrategies) {
        if (!Array.isArray(data[collection])) {
            throw badRequest(`${collection} must be an array`);
        }
    }

    const bundle = { routeId };

    for (const strategy of fareStrategies) {
        bundle[strategy.collection] = strategy.validate(data[strategy.collection], { routeId });
    }

    return bundle;
};

const getAll = async (routeId) => {
    return fareRepository.getAll(routeId);
};

const create = async (data) => {
    if (data && Array.isArray(data.distanceFare)) {
        return fareRepository.createBundle(validateFareBundle(data));
    }

    return fareRepository.create(validateFare(data));
};

const update = async (id, data) => {
    if (!/^[1-9]\d*$/.test(String(id))) {
        throw badRequest("id must be a positive integer");
    }

    const fare = await fareRepository.update(String(id), validateFare(data));

    if (!fare) {
        throw notFound("Fare not found");
    }

    return fare;
};

module.exports = {
    getAll,
    create,
    update
};