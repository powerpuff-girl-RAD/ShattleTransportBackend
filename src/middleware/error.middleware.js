const errorHandler = (err, req, res, next) => {

    console.error(err);

    const statusCode =
        err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message:
            err.message ||
            "Internal server error",
        // Machine-readable reason (e.g. "WRONG_ROUTE") when the service sets a string code
        ...(typeof err.code === "string" ? { code: err.code } : {})
    });
};

module.exports = {
    errorHandler
};