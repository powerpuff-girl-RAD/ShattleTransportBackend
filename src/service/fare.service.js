const fareRepository = require("../repository/fare.repository");

const badRequest = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const validateRouteId = (routeId) => {
    const parsedRouteId = Number(routeId);

    if (!Number.isInteger(parsedRouteId) || parsedRouteId <= 0) {
        throw badRequest("routeId is required and must be a positive integer");
    }

    return parsedRouteId;
};

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

const requiredText = (value, field) => {
    if (typeof value !== "string" || value.trim() === "") {
        throw badRequest(`${field} is required and must be a non-empty string`);
    }

    return value.trim();
};

const requiredAmount = (value, field) => {
    if (value === undefined || value === null || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) {
        throw badRequest(`${field} is required and must be a non-negative number`);
    }

    return Number(value);
};

const splitRange = (value, field) => {
    const parts = requiredText(value, field).split(/\s*[-\u2013\u2014]\s*/);

    if (parts.length !== 2 || parts.some((part) => part === "")) {
        throw badRequest(`${field} must contain a start and end value`);
    }

    return parts;
};

const validateFareBundle = (data) => {
    const routeId = validateRouteId(data.routeId);
    const collectionNames = ["distanceFare", "flatFares", "timeBasedFares", "passes"];

    for (const collectionName of collectionNames) {
        if (!Array.isArray(data[collectionName])) {
            throw badRequest(`${collectionName} must be an array`);
        }
    }

    const distanceFare = data.distanceFare.map((fare, index) => {
        const field = `distanceFare[${index}]`;
        const minkm = requiredAmount(fare.Minkm, `${field}.Minkm`);
        const maxkm = requiredAmount(fare.Maxkm, `${field}.Maxkm`);

        if (maxkm !== 0 && maxkm <= minkm) {
            throw badRequest(`${field}.Maxkm must be greater than Minkm, or 0 for no upper limit`);
        }

        return {
            minkm,
            maxkm,
            standardFare: requiredAmount(fare.StandardFare, `${field}.StandardFare`),
            offPeakFare: requiredAmount(fare.OffPeakFare, `${field}.OffPeakFare`)
        };
    });

    const flatFares = data.flatFares.map((fare, index) => {
        const field = `flatFares[${index}]`;

        if (fare.RouteId !== undefined && validateRouteId(fare.RouteId) !== routeId) {
            throw badRequest(`${field}.RouteId must match routeId`);
        }

        return {
            passengerType: requiredText(fare.PassengerType, `${field}.PassengerType`),
            passengerDescription: requiredText(fare.PassengerDescription, `${field}.PassengerDescription`),
            local: requiredAmount(fare.Local, `${field}.Local`),
            express: requiredAmount(fare.Express, `${field}.Express`),
            rule: requiredText(fare.Rule, `${field}.Rule`),
            status: requiredText(fare.Status, `${field}.Status`)
        };
    });

    const timeBasedFares = data.timeBasedFares.map((fare, index) => {
        const field = `timeBasedFares[${index}]`;
        const [startWindow, endWindow] = splitRange(fare.window, `${field}.window`);
        const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

        if (!timePattern.test(startWindow) || !timePattern.test(endWindow)) {
            throw badRequest(`${field}.window must use 24-hour HH:mm values`);
        }

        const applies = requiredText(fare.applies, `${field}.applies`).toUpperCase();
        let appliesFrom;
        let appliesTo;

        if (applies === "ALL DAYS") {
            appliesFrom = "ALL";
            appliesTo = "ALL";
        } else {
            [appliesFrom, appliesTo] = splitRange(applies, `${field}.applies`);

            if (!/^[A-Z]{3}$/.test(appliesFrom) || !/^[A-Z]{3}$/.test(appliesTo)) {
                throw badRequest(`${field}.applies must be a weekday range or ALL DAYS`);
            }
        }

        return {
            period: requiredText(fare.period, `${field}.period`),
            startWindow,
            endWindow,
            appliesFrom,
            appliesTo,
            fareRule: requiredText(fare.rule, `${field}.rule`),
            status: requiredText(fare.status, `${field}.status`)
        };
    });

    const passes = data.passes.map((pass, index) => {
        const field = `passes[${index}]`;
        const validity = Number(pass.Validity);

        if (!Number.isInteger(validity) || validity <= 0) {
            throw badRequest(`${field}.Validity must be a positive integer`);
        }

        if (typeof pass.IsOn !== "boolean") {
            throw badRequest(`${field}.IsOn must be a boolean`);
        }

        return {
            passProduct: requiredText(pass.PassProduct, `${field}.PassProduct`),
            tagline: requiredText(pass.Tagline, `${field}.Tagline`),
            price: requiredAmount(pass.Price, `${field}.Price`),
            validity,
            usageCondition: requiredText(pass.UsageCondition, `${field}.UsageCondition`),
            isOn: pass.IsOn
        };
    });

    return { routeId, distanceFare, flatFares, timeBasedFares, passes };
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
        const error = new Error("Fare not found");
        error.statusCode = 404;
        throw error;
    }

    return fare;
};

module.exports = {
    getAll,
    create,
    update
};