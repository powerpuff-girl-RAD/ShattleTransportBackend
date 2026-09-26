const jwt = require("jsonwebtoken");
const env = require("../config/env");

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Access token required"
        });
    }

    jwt.verify(token, env.jwt.accessSecret, (err, decoded) => {
        if (err) {
            const reason = err.name === "TokenExpiredError" ? "expired" : "invalid";

            return res.status(403).json({
                success: false,
                message: `Access token ${reason}`
            });
        }

        req.user = decoded;
        next();
    });
};

module.exports = {
    authenticateToken
};