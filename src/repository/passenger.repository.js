const { sql, getPool } = require('../config/database');

// ─── PassengerAccounts ────────────────────────────────────────────────────

/** Fetches the passenger account; creates one lazily if it does not exist. */
const getOrCreateAccount = async (userId) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('UserId', sql.Int, userId)
        .execute('sp_PassengerAccount_GetOrCreate');
    return result.recordset[0];
};

// ─── PassengerProfile ─────────────────────────────────────────────────────

/** Returns the full passenger profile joined across Users, PassengerProfile and PassengerAccounts. */
const getProfile = async (userId) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('UserId', sql.Int, userId)
        .execute('sp_PassengerProfile_Get');
    return result.recordset[0] || null;
};

/** Creates or updates the extended profile row and FullName in Users. */
const upsertProfile = async (userId, { fullName, phone, address, dateOfBirth, nic }) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('UserId',      sql.Int,          userId)
        .input('FullName',    sql.NVarChar(255), fullName || null)
        .input('Phone',       sql.NVarChar(20),  phone || null)
        .input('Address',     sql.NVarChar(300), address || null)
        .input('DateOfBirth', sql.Date,          dateOfBirth || null)
        .input('NIC',         sql.NVarChar(50),  nic || null)
        .execute('sp_PassengerProfile_Upsert');
    return result.recordset[0] || null;
};

/** Replaces the PasswordHash. The service layer must verify the old password before calling. */
const changePasswordHash = async (userId, newHash) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('UserId',          sql.Int,          userId)
        .input('NewPasswordHash', sql.NVarChar(255), newHash)
        .execute('sp_PassengerPassword_Change');
    return result.recordset[0]?.Affected ?? 0;
};

// ─── Top-Up & Transactions ────────────────────────────────────────────────

/** Processes top-up in database, updating balance and recording transaction. */
const topUpAccount = async ({
    userId,
    amount,
    paymentMethod,
    cardLast4,
    cardType,
    cardholderName,
    gatewayRef,
    transactionRef,
}) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('UserId',         sql.Int,           userId)
        .input('Amount',         sql.Decimal(12, 2), amount)
        .input('PaymentMethod',  sql.NVarChar(50),  paymentMethod)
        .input('CardLast4',      sql.NVarChar(4),   cardLast4 || null)
        .input('CardType',       sql.NVarChar(20),  cardType || null)
        .input('CardholderName', sql.NVarChar(100), cardholderName || null)
        .input('GatewayRef',     sql.NVarChar(100), gatewayRef || null)
        .input('TransactionRef', sql.NVarChar(50),  transactionRef)
        .execute('sp_PassengerAccount_TopUp');
    return result.recordset[0] || null;
};

/** Retrieves recent top-up transactions for a passenger. */
const getTopUpHistory = async (userId, limit = 20) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('UserId', sql.Int, userId)
        .input('Limit',  sql.Int, limit)
        .execute('sp_PassengerTopUp_GetHistory');
    return result.recordset || [];
};

/** Retrieves top-up transaction details by reference. */
const getTopUpByRef = async (transactionRef, userId) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('TransactionRef', sql.NVarChar(50), transactionRef)
        .input('UserId',         sql.Int,          userId)
        .execute('sp_PassengerTopUp_GetByRef');
    return result.recordset[0] || null;
};

module.exports = {
    getOrCreateAccount,
    getProfile,
    upsertProfile,
    changePasswordHash,
    topUpAccount,
    getTopUpHistory,
    getTopUpByRef,
};