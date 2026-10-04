const { getCollection, nextId, NO_ID } = require('../config/database');

const DUPLICATE_KEY = 11000;

const users = () => getCollection('users');
const profiles = () => getCollection('passengerProfiles');
const accounts = () => getCollection('passengerAccounts');
const topUps = () => getCollection('passengerTopUps');

const round2 = (value) => Math.round(value * 100) / 100;

// ─── PassengerAccounts ────────────────────────────────────────────────────

/** Fetches the passenger account; creates one lazily if it does not exist. */
const getOrCreateAccount = async (userId) => {
    const collection = await accounts();
    const filter = { UserId: Number(userId) };

    const existing = await collection.findOne(filter, NO_ID);
    if (existing) return existing;

    try {
        await collection.insertOne({
            Id: await nextId('passengerAccounts'),
            UserId: Number(userId),
            Balance: 0,
            Currency: 'LKR',
            Status: 'Active',
            CreatedAt: new Date(),
        });
    } catch (error) {
        if (error.code !== DUPLICATE_KEY) throw error;
    }

    return collection.findOne(filter, NO_ID);
};

// ─── PassengerProfile ─────────────────────────────────────────────────────

/** Returns the full passenger profile combined from users, passengerProfiles and passengerAccounts. */
const getProfile = async (userId) => {
    const user = await (await users()).findOne({ Id: Number(userId) }, NO_ID);
    if (!user) return null;

    const [profile, account] = await Promise.all([
        profiles().then((c) => c.findOne({ UserId: Number(userId) }, NO_ID)),
        getOrCreateAccount(userId),
    ]);

    return {
        UserId: user.Id,
        Email: user.Email,
        FullName: user.FullName,
        Role: user.Role,
        MemberSince: user.CreatedAt,
        Phone: profile?.Phone ?? null,
        Address: profile?.Address ?? null,
        DateOfBirth: profile?.DateOfBirth ?? null,
        NIC: profile?.NIC ?? null,
        AvatarUrl: profile?.AvatarUrl ?? null,
        AccountId: account.Id,
        Balance: account.Balance,
        Currency: account.Currency,
        AccountStatus: account.Status,
    };
};

/** Creates or updates the extended profile row and FullName in users. */
const upsertProfile = async (userId, { fullName, phone, address, dateOfBirth, nic }) => {
    if (fullName) {
        await (await users()).updateOne({ Id: Number(userId) }, { $set: { FullName: fullName } });
    }

    await (await profiles()).updateOne(
        { UserId: Number(userId) },
        {
            $set: {
                Phone: phone || null,
                Address: address || null,
                DateOfBirth: dateOfBirth || null,
                NIC: nic || null,
            },
        },
        { upsert: true }
    );

    return getProfile(userId);
};

/** Replaces the PasswordHash. The service layer must verify the old password before calling. */
const changePasswordHash = async (userId, newHash) => {
    const result = await (await users()).updateOne(
        { Id: Number(userId) },
        { $set: { PasswordHash: newHash } }
    );
    return result.matchedCount;
};

// ─── Top-Up & Transactions ────────────────────────────────────────────────

/** Increments the balance atomically and records the transaction. */
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
    const account = await getOrCreateAccount(userId);
    const accountCollection = await accounts();

    const before = await accountCollection.findOneAndUpdate(
        { Id: account.Id },
        { $inc: { Balance: amount } },
        { ...NO_ID, returnDocument: 'before' }
    );
    if (!before) return null;

    const transaction = {
        Id: await nextId('passengerTopUps'),
        UserId: Number(userId),
        AccountId: account.Id,
        TransactionRef: transactionRef,
        Amount: amount,
        Currency: account.Currency || 'LKR',
        PaymentMethod: paymentMethod,
        CardLast4: cardLast4 || null,
        CardType: cardType || null,
        CardholderName: cardholderName || null,
        GatewayRef: gatewayRef || null,
        Status: 'Completed',
        CreatedAt: new Date(),
    };

    try {
        await (await topUps()).insertOne({ ...transaction });
    } catch (error) {
        await accountCollection.updateOne({ Id: account.Id }, { $inc: { Balance: -amount } });
        throw error;
    }

    return {
        ...transaction,
        PreviousBalance: before.Balance,
        NewBalance: round2(before.Balance + amount),
    };
};

/** Retrieves recent top-up transactions for a passenger. */
const getTopUpHistory = async (userId, limit = 20) => {
    return (await topUps())
        .find({ UserId: Number(userId) }, NO_ID)
        .sort({ CreatedAt: -1 })
        .limit(Number(limit))
        .toArray();
};

/** Retrieves top-up transaction details by reference. */
const getTopUpByRef = async (transactionRef, userId) => {
    const transaction = await (await topUps()).findOne(
        { TransactionRef: transactionRef, UserId: Number(userId) },
        NO_ID
    );
    if (!transaction) return null;

    const account = await (await accounts()).findOne({ Id: transaction.AccountId }, NO_ID);

    return { ...transaction, CurrentBalance: account ? account.Balance : 0 };
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
