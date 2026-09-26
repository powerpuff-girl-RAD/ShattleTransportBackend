const { Resend } = require("resend");

const env = require("../config/env");

const resend = new Resend(env.resend.apiKey);

const sendEmail = async (to, body) => {
    if (!to) {
        const error = new Error("Recipient email is required");
        error.statusCode = 400;
        throw error;
    }

    if (!body) {
        const error = new Error("Email body is required");
        error.statusCode = 400;
        throw error;
    }

    return await resend.emails.send({
        from: env.resend.fromEmail,
        to,
        subject: "Shuttle Transport Notification",
        html: body
    });
};

module.exports = {
    sendEmail
};
