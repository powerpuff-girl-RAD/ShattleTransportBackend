const dotenv = require("dotenv");

dotenv.config();

module.exports = {
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || "development",

    jwt: {
        accessSecret:  process.env.JWT_ACCESS_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessExpiry:  process.env.ACCESS_TOKEN_EXPIRY  || "15m",
        refreshExpiry: process.env.REFRESH_TOKEN_EXPIRY || "7d",
        qrSecret:      process.env.JWT_QR_SECRET || process.env.JWT_ACCESS_SECRET,
        qrExpiry:      process.env.QR_TOKEN_EXPIRY || "5m",
    },

    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || null,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    },

    gmail: {
        user: process.env.GMAIL_USER,
        appPassword: process.env.GMAIL_APP_PASSWORD
    },

    resend: {
        apiKey: process.env.RESEND_API_KEY,
        fromEmail: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
    }
};