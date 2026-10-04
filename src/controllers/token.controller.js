const tokenService = require('../service/token.service');

// ─── Token activation ─────────────────────────────────────────────────────

const activateToken = async (req, res, next) => {
    try {
        const { tokenSerial, tokenType } = req.body;

        if (!tokenSerial) {
            return res.status(400).json({
                success: false,
                message: 'tokenSerial is required',
            });
        }

        const token = await tokenService.activateToken(req.user.id, {
            tokenSerial,
            tokenType: tokenType || 'QR',
        });

        res.status(201).json({
            success: true,
            message: `Token #${token.TokenSerial} linked successfully`,
            token: _formatToken(token),
        });
    } catch (error) {
        next(error);
    }
};

// ─── Token retrieval ──────────────────────────────────────────────────────

const getActiveToken = async (req, res, next) => {
    try {
        const token = await tokenService.getActiveToken(req.user.id);
        res.status(200).json({ success: true, token: _formatToken(token) });
    } catch (error) {
        next(error);
    }
};

// ─── QR generation ───────────────────────────────────────────────────────

/** Generates a fresh short-lived QR JWT for the mobile app to display. */
const generateQR = async (req, res, next) => {
    try {
        const result = await tokenService.generateQR(req.user.id);

        res.status(200).json({
            success: true,
            qrPayload: result.qrPayload,
            tokenSerial: result.tokenSerial,
            tokenId: result.tokenId,
            expiresIn: 300, // seconds (matches JWT 5m expiry)
        });
    } catch (error) {
        next(error);
    }
};

// ─── QR validation ────────────────────────────────────────────────────────

/**
 * Called by the inspector device after scanning a passenger's QR.
 * Does NOT require the passenger's auth token — the inspector is authenticated.
 * Returns token status, passenger info and account balance.
 */
const validateQR = async (req, res, next) => {
    try {
        const { qrPayload } = req.body;

        if (!qrPayload) {
            return res.status(400).json({
                success: false,
                message: 'qrPayload is required',
            });
        }

        const token = await tokenService.validateQR(qrPayload);

        res.status(200).json({
            success: true,
            valid: true,
            token: {
                serial: token.TokenSerial,
                type: token.TokenType,
                status: token.Status,
                passengerName: token.PassengerName,
                passengerEmail: token.PassengerEmail,
                balance: Number(token.Balance),
            },
        });
    } catch (error) {
        // Return a structured 200 with valid:false so the scanner UI can
        // display a specific error message rather than a generic HTTP error.
        if (error.statusCode === 403 || error.statusCode === 404) {
            return res.status(200).json({
                success: true,
                valid: false,
                reason: error.message,
            });
        }
        next(error);
    }
};

// ─── Token deactivation ───────────────────────────────────────────────────

const deactivateToken = async (req, res, next) => {
    try {
        const { tokenSerial } = req.params;
        await tokenService.deactivateToken(req.user.id, tokenSerial);
        res.status(200).json({ success: true, message: 'Token deactivated' });
    } catch (error) {
        next(error);
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const _formatToken = (row) => ({
    id: row.Id,
    serial: row.TokenSerial,
    type: row.TokenType,
    status: row.Status,
    activatedAt: row.ActivatedAt,
    expiresAt: row.ExpiresAt || null,
    lastUsedAt: row.LastUsedAt || null,
});

module.exports = {
    activateToken,
    getActiveToken,
    generateQR,
    validateQR,
    deactivateToken,
};

