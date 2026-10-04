const { getCollection, nextId, NO_ID } = require('../config/database');

const DUPLICATE_KEY = 11000;

const tokens = () => getCollection('passengerTokens');
const users = () => getCollection('users');
const accounts = () => getCollection('passengerAccounts');

// ─── Token CRUD ───────────────────────────────────────────────────────────

/**
 * Link a token serial to a passenger account.
 * Three guards (previously enforced by the stored procedure):
 *   1. Idempotent  — same serial + same owner → returns existing row.
 *   2. Conflict    — serial owned by someone else → throws.
 *   3. Duplicate   — passenger already has an active token of this type → throws.
 */
const activateToken = async ({ userId, accountId, tokenSerial, tokenType = 'QR', expiresAt = null }) => {
    const collection = await tokens();
    const owner = Number(userId);

    const existing = await collection.findOne({ TokenSerial: tokenSerial }, NO_ID);

    if (existing && existing.UserId !== owner) {
        throw new Error('This token is already linked to another account');
    }

    if (existing && existing.Status === 'Active') {
        return existing;
    }

    const alreadyActive = await collection.findOne(
        { UserId: owner, TokenType: tokenType, Status: 'Active' },
        NO_ID
    );

    if (alreadyActive) {
        throw new Error(`You already have an active ${tokenType} token. Deactivate it first`);
    }

    const activation = { Status: 'Active', ActivatedAt: new Date(), ExpiresAt: expiresAt, LastUsedAt: null };

    if (existing) {
        return collection.findOneAndUpdate(
            { TokenSerial: tokenSerial },
            { $set: activation },
            { ...NO_ID, returnDocument: 'after' }
        );
    }

    const token = {
        Id: await nextId('passengerTokens'),
        UserId: owner,
        AccountId: accountId,
        TokenSerial: tokenSerial,
        TokenType: tokenType,
        ...activation,
    };

    try {
        await collection.insertOne({ ...token });
    } catch (error) {
        if (error.code === 11000) {
            throw new Error('This token is already linked to another account');
        }
        throw error;
    }

    return token;
};

/** Returns the passenger's most recent token of the type that has not been deactivated. */
const getActiveToken = async (userId, tokenType = 'QR') => {
    return (await tokens()).findOne(
        { UserId: Number(userId), TokenType: tokenType, Status: { $ne: 'Deactivated' } },
        { ...NO_ID, sort: { ActivatedAt: -1 } }
    );
};

/** Looks up a token by its serial — used by inspector / scanner validation. */
const getTokenBySerial = async (tokenSerial) => {
    const token = await (await tokens()).findOne({ TokenSerial: tokenSerial }, NO_ID);
    if (!token) return null;

    const [user, account] = await Promise.all([
        users().then((c) => c.findOne({ Id: token.UserId }, NO_ID)),
        accounts().then((c) => c.findOne({ UserId: token.UserId }, NO_ID)),
    ]);

    return {
        ...token,
        PassengerName: user?.FullName ?? null,
        PassengerEmail: user?.Email ?? null,
        Balance: account?.Balance ?? 0,
    };
};

/** Changes token status (Active → Blocked / Expired / Deactivated). */
const updateTokenStatus = async ({ tokenSerial, userId, status }) => {
    const result = await (await tokens()).updateOne(
        { TokenSerial: tokenSerial, UserId: Number(userId) },
        { $set: { Status: status } }
    );
    return result.matchedCount;
};

/** Stamps LastUsedAt on a token (called after every scan). */
const markTokenUsed = async (tokenSerial) => {
    await (await tokens()).updateOne({ TokenSerial: tokenSerial }, { $set: { LastUsedAt: new Date() } });
};

module.exports = {
    activateToken,
    getActiveToken,
    getTokenBySerial,
    updateTokenStatus,
    markTokenUsed,
};
