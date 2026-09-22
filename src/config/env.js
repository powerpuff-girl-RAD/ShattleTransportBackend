const dotenv = require("dotenv");

dotenv.config();

module.exports = {
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || "development",

    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessExpiry: process.env.ACCESS_TOKEN_EXPIRY || "15m",
        refreshExpiry: process.env.REFRESH_TOKEN_EXPIRY || "7d"
    }
};