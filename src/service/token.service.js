const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const env = require('../config/env');
const tokenRepository = require('../repository/token.repository');
const passengerRepository = require('../repository/passenger.repository');

// ─── QR payload generation ────────────────────────────────────────────────

/**
 * Creates a short-lived signed JWT that the mobile app encodes into a QR code.
 *
 * Payload contains ONLY non-sensitive routing data — no PII, no balance.
 * The inspector device sends this back to the backend for validation; the
 * backend then authorises the journey after checking token status and balance.
 *
 * Expiry: 5 minutes (configurable via QR_TOKEN_EXPIRY env var).
 */
const generateQRPayload = (token) => {
    const nonce = crypto.randomBytes(8).toString('hex'); // prevents replay within expiry window
    return jwt.sign(
        {
            tokenId: token.Id,
            serial: token.TokenSerial,
            type: token.TokenType,
            nonce,
        },
        env.jwt.qrSecret,
        { expiresIn: env.jwt.qrExpiry || '5m' }
    );
};

// ─── Token service methods ────────────────────────────────────────────────

/**
 * Activates a token serial for the authenticated passenger.
 * Lazily creates the passenger account if it does not yet exist.
 * Returns the activated token row.
 */
const activateToken = async (userId, { tokenSerial, tokenType = 'QR' }) => {
    if (!tokenSerial || tokenSerial.trim().length === 0) {
        const error = new Error('Token serial number is required');
        error.statusCode = 400;
        throw error;
    }

    const serial = tokenSerial.trim().toUpperCase();

    // Validate serial format: TK-<digits> — adjust regex if format changes
    if (!/^TK-[A-Z0-9]{3,20}$/.test(serial)) {
        const error = new Error('Invalid token serial format. Expected: TK-XXXXX');
        error.statusCode = 400;
        throw error;
    }

    // Validate token type — integration interfaces for Smartcard and Barcode
    // are isolated here so future implementations only need to extend this check
    const SUPPORTED_TYPES = ['QR', 'Smartcard', 'Barcode'];
    if (!SUPPORTED_TYPES.includes(tokenType)) {
        const error = new Error(`Unsupported token type. Supported: ${SUPPORTED_TYPES.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }

    // If type is Smartcard or Barcode, route to the dedicated integration interface
    if (tokenType !== 'QR') {
        return _activatePhysicalToken(userId, serial, tokenType);
    }

    const account = await passengerRepository.getOrCreateAccount(userId);

    try {
        const token = await tokenRepository.activateToken({
            userId,
            accountId: account.Id,
            tokenSerial: serial,
            tokenType,
        });
        return token;
    } catch (err) {
        // Surface SP RAISERROR messages as 409 Conflict
        const error = new Error(err.message || 'Token activation failed');
        error.statusCode = 409;
        throw error;
    }
};

/**
 * Isolated integration interface for Smartcard and Barcode tokens.
 * Currently returns a stub response so the boarding flow can be tested
 * without physical hardware. Replace the stub body with real hardware SDK
 * calls when physical integration is required.
 */
const _activatePhysicalToken = async (userId, serial, tokenType) => {
    // TODO: Integrate physical token reader SDK here.
    // The account/repository layer is already wired up — just call activateToken
    // with the resolved serial from the hardware SDK response.
    const error = new Error(`${tokenType} token integration is not yet available. Use QR for now.`);
    error.statusCode = 501;
    throw error;
};

/**
 * Returns the current active token for the passenger.
 * Throws 404 if the passenger has no active token.
 */
const getActiveToken = async (userId) => {
    const token = await tokenRepository.getActiveToken(userId);
    if (!token) {
        const error = new Error('No active token found. Activate a token first.');
        error.statusCode = 404;
        throw error;
    }
    return token;
};

/**
 * Generates a short-lived QR JWT for the passenger's active token.
 * Also stamps LastUsedAt on the token row.
 */
const generateQR = async (userId) => {
    const token = await getActiveToken(userId);

    if (token.Status !== 'Active') {
        const error = new Error(`Token is ${token.Status.toLowerCase()} and cannot be used`);
        error.statusCode = 403;
        throw error;
    }

    if (token.ExpiresAt && new Date(token.ExpiresAt) < new Date()) {
        // Auto-expire token in DB
        await tokenRepository.updateTokenStatus({
            tokenSerial: token.TokenSerial,
            userId,
            status: 'Expired',
        });
        const error = new Error('Your token has expired. Please activate a new one.');
        error.statusCode = 403;
        throw error;
    }

    await tokenRepository.markTokenUsed(token.TokenSerial);

    return {
        qrPayload: generateQRPayload(token),
        tokenSerial: token.TokenSerial,
        tokenId: token.Id,
    };
};

/**
 * Validates a QR JWT (submitted by an inspector / gate scanner).
 * Verifies signature, expiry, token status, and token ownership.
 * Returns the token row and passenger account if valid.
 */
const validateQR = async (qrJwt) => {
    let decoded;
    try {
        decoded = jwt.verify(qrJwt, env.jwt.qrSecret);
    } catch (err) {
        const error = new Error('QR code is invalid or has expired. Please refresh it.');
        error.statusCode = 403;
        throw error;
    }

    const token = await tokenRepository.getTokenBySerial(decoded.serial);

    if (!token) {
        const error = new Error('Token not found');
        error.statusCode = 404;
        throw error;
    }

    if (token.Status !== 'Active') {
        const error = new Error(`Token is ${token.Status.toLowerCase()}`);
        error.statusCode = 403;
        throw error;
    }

    // Stamp usage
    await tokenRepository.markTokenUsed(token.TokenSerial);

    return token;
};

/**
 * Deactivates (unlinks) the passenger's active token.
 */
const deactivateToken = async (userId, tokenSerial) => {
    const token = await tokenRepository.getTokenBySerial(tokenSerial);

    if (!token || token.UserId !== userId) {
        const error = new Error('Token not found or does not belong to your account');
        error.statusCode = 404;
        throw error;
    }

    await tokenRepository.updateTokenStatus({
        tokenSerial,
        userId,
        status: 'Deactivated',
    });
};

module.exports = {
    activateToken,
    getActiveToken,
    generateQR,
    validateQR,
    deactivateToken,
};
