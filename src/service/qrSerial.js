const jwt = require("jsonwebtoken");

const env = require("../config/env");

// Turns whatever the inspector scanned or typed into a token serial.
// Shared by Inspect, Scan (tap-in / tap-out) and Validate.
//
// QR codes carry a signed JWT: wallet tokens (token.service generateQR) use
// `serial`, booking tokens (booking.service activateBookingToken) use `tokenSerial`.
// Smartcards / barcodes are typed in by the inspector as a plain serial.
//
// Returns { serial } or { serial: null, qrError, qrErrorCode }.
// qrErrorCode: "EXPIRED" | "FOREIGN" | "NOT_A_TOKEN"
const resolveSerial = ({ qrPayload, tokenSerial }) => {

    if (tokenSerial) {
        return { serial: String(tokenSerial).trim().toUpperCase() };
    }

    const text = String(qrPayload).trim();

    // 1. Signed QR (wallet token or activated booking) — the signature proves the app made it
    try {
        const decoded = jwt.verify(text, env.jwt.qrSecret);
        const serial = decoded.serial || decoded.tokenSerial;
        return serial
            ? { serial: String(serial).toUpperCase() }
            : { serial: null, qrError: "This QR code is not a passenger token", qrErrorCode: "NOT_A_TOKEN" };
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return { serial: null, qrError: "This QR code has expired. Ask the passenger to refresh it.", qrErrorCode: "EXPIRED" };
        }
        if (error.name === "JsonWebTokenError" && text.split(".").length === 3) {
            return { serial: null, qrError: "This QR code was not issued by Shattle Transport", qrErrorCode: "FOREIGN" };
        }
        // Not a JWT at all: try the other formats below
    }

    // 2. Booking QR shown before the booking is activated: plain JSON with
    //    tokenSerial (or bookingToken). It isn't signed, so it is trusted no more
    //    than a typed serial — the database checks still decide the result.
    try {
        const data = JSON.parse(text);
        const serial = data && (data.tokenSerial || data.bookingToken);
        if (serial) {
            return { serial: String(serial).trim().toUpperCase() };
        }
    } catch {
        // not JSON
    }

    // 3. A bare serial (e.g. a printed barcode ticket that says "TK-2625")
    if (/^TK-[A-Z0-9-]+$/i.test(text)) {
        return { serial: text.toUpperCase() };
    }

    return { serial: null, qrError: "This QR code is not a Shattle passenger token", qrErrorCode: "NOT_A_TOKEN" };
};

module.exports = { resolveSerial };
