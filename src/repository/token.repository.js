const { sql, getPool } = require('../config/database');

// ─── Token CRUD ───────────────────────────────────────────────────────────

/**
 * Link a token serial to a passenger account.
 * The SP enforces three guards:
 *   1. Idempotent  — same serial + same owner → returns existing row.
 *   2. Conflict    — serial owned by someone else → throws.
 *   3. Duplicate   — passenger already has an active token of this type → throws.
 */
const activateToken = async ({ userId, accountId, tokenSerial, tokenType = 'QR', expiresAt = null }) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('UserId', sql.Int, userId)
        .input('AccountId', sql.BigInt, accountId)
        .input('TokenSerial', sql.NVarChar(50), tokenSerial)
        .input('TokenType', sql.NVarChar(20), tokenType)
        .input('ExpiresAt', sql.DateTime2, expiresAt)
        .execute('sp_PassengerToken_Activate');
    return result.recordset[0] || null;
};

/** Returns the current active token for a passenger (by type). */
const getActiveToken = async (userId, tokenType = 'QR') => {
    const pool = await getPool();
    const result = await pool.request()
        .input('UserId', sql.Int, userId)
        .input('TokenType', sql.NVarChar(20), tokenType)
        .execute('sp_PassengerToken_GetByUserId');
    return result.recordset[0] || null;
};

/** Looks up a token by its serial — used by inspector / scanner validation. */
const getTokenBySerial = async (tokenSerial) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('TokenSerial', sql.NVarChar(50), tokenSerial)
        .execute('sp_PassengerToken_GetBySerial');
    return result.recordset[0] || null;
};

/** Changes token status (Active → Blocked / Expired / Deactivated). */
const updateTokenStatus = async ({ tokenSerial, userId, status }) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('TokenSerial', sql.NVarChar(50), tokenSerial)
        .input('UserId', sql.Int, userId)
        .input('Status', sql.NVarChar(20), status)
        .execute('sp_PassengerToken_UpdateStatus');
    return result.recordset[0]?.Affected ?? 0;
};

/** Stamps LastUsedAt on a token (called after every scan). */
const markTokenUsed = async (tokenSerial) => {
    const pool = await getPool();
    await pool.request()
        .input('TokenSerial', sql.NVarChar(50), tokenSerial)
        .execute('sp_PassengerToken_MarkUsed');
};

module.exports = {
    activateToken,
    getActiveToken,
    getTokenBySerial,
    updateTokenStatus,
    markTokenUsed,
};

