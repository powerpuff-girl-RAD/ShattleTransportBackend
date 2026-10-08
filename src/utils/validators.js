const { badRequest } = require("./errors");

const validateRouteId = (routeId) => {
    const parsedRouteId = Number(routeId);

    if (!Number.isInteger(parsedRouteId) || parsedRouteId <= 0) {
        throw badRequest("routeId is required and must be a positive integer");
    }

    return parsedRouteId;
};

const optionalFareId = (id, field) => {
    if (id === undefined || id === null) {
        return undefined;
    }

    const parsedId = Number(id);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
        throw badRequest(`${field}.Id must be a positive integer`);
    }

    return parsedId;
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

module.exports = {
    validateRouteId,
    optionalFareId,
    requiredText,
    requiredAmount,
    splitRange
};
