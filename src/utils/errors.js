// Error Factory: single place that builds HTTP-aware errors
const createError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const badRequest = (message) => createError(400, message);
const notFound = (message) => createError(404, message);
const conflict = (message) => createError(409, message);

module.exports = {
    createError,
    badRequest,
    notFound,
    conflict
};
