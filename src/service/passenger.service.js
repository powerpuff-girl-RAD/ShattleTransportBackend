const bcrypt = require('bcryptjs');
const passengerRepository = require('../repository/passenger.repository');

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
    // Whitelist of updatable fields — never allow email or role changes here
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

    // Fetch current hash — we re-use the auth repository's findById
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

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
};

