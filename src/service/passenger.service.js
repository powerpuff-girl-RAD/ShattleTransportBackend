const bcrypt = require('bcryptjs');
const passengerRepository = require('../repository/passenger.repository');
const paymentService = require('./payment.service');

// ─── Profile ──────────────────────────────────────────────────────────────

/**
 * Returns the full passenger profile (Users + PassengerProfile + PassengerAccounts).
 * The repository lazily creates the account row if needed.
 */
const getProfile = async (userId) => {
    const profile = await passengerRepository.getProfile(userId);
    if (!profile) {
        const error = new Error('Passenger profile not found');
        error.statusCode = 404;
        throw error;
    }
    return profile;
};

/**
 * Updates the passenger's name and/or extended contact information.
 * Returns the updated full profile.
 */
const updateProfile = async (userId, fields) => {
    const { fullName, phone, address, dateOfBirth, nic } = fields;

    const updated = await passengerRepository.upsertProfile(userId, {
        fullName,
        phone,
        address,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        nic,
    });

    if (!updated) {
        const error = new Error('Profile update failed');
        error.statusCode = 500;
        throw error;
    }

    return updated;
};

// ─── Password ─────────────────────────────────────────────────────────────

/**
 * Validates the current password then replaces it with the new one.
 * Throws 400 if current password is wrong or new password is too short.
 */
const changePassword = async (userId, { currentPassword, newPassword }) => {
    if (!newPassword || newPassword.length < 8) {
        const error = new Error('New password must be at least 8 characters');
        error.statusCode = 400;
        throw error;
    }

    const authRepository = require('../repository/auth.repository');
    const user = await authRepository.findById(userId);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const valid = await bcrypt.compare(currentPassword, user.PasswordHash);
    if (!valid) {
        const error = new Error('Current password is incorrect');
        error.statusCode = 401;
        throw error;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    const affected = await passengerRepository.changePasswordHash(userId, newHash);
    if (!affected) {
        const error = new Error('Password update failed');
        error.statusCode = 500;
        throw error;
    }
};

// ─── Top-Up & Payment Gateway ─────────────────────────────────────────────

/**
 * Helper to generate transaction reference: TXN-YYYYMMDD-XXXX
 */
const _generateTransactionRef = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `TXN-${yyyy}${mm}${dd}-${rand}`;
};

/**
 * Processes a card payment top-up into the passenger's travel wallet.
 */
const topUpAccount = async (userId, {
    amount,
    paymentMethod = 'Debit Card',
    cardNumber,
    expiry,
    cvv,
    cardholderName,
}) => {
    const topUpAmount = Number(amount);

    if (isNaN(topUpAmount) || topUpAmount <= 0) {
        const error = new Error('Please enter a valid top-up amount greater than 0.');
        error.statusCode = 400;
        throw error;
    }

    if (topUpAmount > 50000) {
        const error = new Error('Maximum top-up amount is LKR 50,000 per transaction.');
        error.statusCode = 400;
        throw error;
    }

    const allowedMethods = ['Debit Card', 'Credit Card'];
    const method = allowedMethods.includes(paymentMethod) ? paymentMethod : 'Debit Card';

    // 1. Process payment via Stripe / Gateway Service
    const paymentResult = await paymentService.processCardPayment({
        amount: topUpAmount,
        currency: 'LKR',
        cardNumber,
        expiry,
        cvv,
        cardholderName,
    });

    const transactionRef = _generateTransactionRef();

    // 2. Execute atomic balance increment & transaction logging in Database
    const result = await passengerRepository.topUpAccount({
        userId,
        amount: topUpAmount,
        paymentMethod: method,
        cardLast4: paymentResult.cardLast4,
        cardType: paymentResult.cardType,
        cardholderName: cardholderName ? cardholderName.trim() : null,
        gatewayRef: paymentResult.gatewayRef,
        transactionRef,
    });

    if (!result) {
        const error = new Error('Top-up transaction failed to record in database.');
        error.statusCode = 500;
        throw error;
    }

    return {
        transaction: {
            id:             result.Id,
            transactionRef: result.TransactionRef,
            amount:         Number(result.Amount),
            currency:       result.Currency || 'LKR',
            paymentMethod:  result.PaymentMethod,
            cardLast4:      result.CardLast4,
            cardType:       result.CardType,
            cardholderName: result.CardholderName,
            status:         result.Status,
            createdAt:      result.CreatedAt,
        },
        previousBalance: Number(result.PreviousBalance),
        newBalance:      Number(result.NewBalance),
    };
};

/**
 * Retrieves passenger's top-up transaction history.
 */
const getTopUpHistory = async (userId, limit = 20) => {
    const list = await passengerRepository.getTopUpHistory(userId, limit);
    return list.map((item) => ({
        id:             item.Id,
        transactionRef: item.TransactionRef,
        amount:         Number(item.Amount),
        currency:       item.Currency || 'LKR',
        paymentMethod:  item.PaymentMethod,
        cardLast4:      item.CardLast4,
        cardType:       item.CardType,
        cardholderName: item.CardholderName,
        status:         item.Status,
        createdAt:      item.CreatedAt,
    }));
};

/**
 * Retrieves single top-up receipt by transaction reference.
 */
const getTopUpByRef = async (userId, transactionRef) => {
    const item = await passengerRepository.getTopUpByRef(transactionRef, userId);
    if (!item) {
        const error = new Error('Transaction receipt not found.');
        error.statusCode = 404;
        throw error;
    }

    return {
        id:             item.Id,
        transactionRef: item.TransactionRef,
        amount:         Number(item.Amount),
        currency:       item.Currency || 'LKR',
        paymentMethod:  item.PaymentMethod,
        cardLast4:      item.CardLast4,
        cardType:       item.CardType,
        cardholderName: item.CardholderName,
        status:         item.Status,
        createdAt:      item.CreatedAt,
        currentBalance: Number(item.CurrentBalance),
    };
};

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    topUpAccount,
    getTopUpHistory,
    getTopUpByRef,
};