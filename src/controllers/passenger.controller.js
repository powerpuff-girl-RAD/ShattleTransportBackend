const passengerService = require('../service/passenger.service');

// ─── Profile ──────────────────────────────────────────────────────────────

const getProfile = async (req, res, next) => {
    try {
        const profile = await passengerService.getProfile(req.user.id);

        res.status(200).json({
            success: true,
            profile: _formatProfile(profile),
        });
    } catch (error) {
        next(error);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const { fullName, phone, address, dateOfBirth, nic } = req.body;
        const updated = await passengerService.updateProfile(req.user.id, {
            fullName,
            phone,
            address,
            dateOfBirth,
            nic,
        });

        res.status(200).json({
            success: true,
            profile: _formatProfile(updated),
        });
    } catch (error) {
        next(error);
    }
};

const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'currentPassword and newPassword are required',
            });
        }

        await passengerService.changePassword(req.user.id, {
            currentPassword,
            newPassword,
        });

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
};

// ─── Top-Up ───────────────────────────────────────────────────────────────

const topUpAccount = async (req, res, next) => {
    try {
        const {
            amount,
            paymentMethod,
            cardNumber,
            expiry,
            cvv,
            cardholderName,
        } = req.body;

        const result = await passengerService.topUpAccount(req.user.id, {
            amount,
            paymentMethod,
            cardNumber,
            expiry,
            cvv,
            cardholderName,
        });

        res.status(200).json({
            success:         true,
            message:         'Top-up successful',
            transaction:     result.transaction,
            previousBalance: result.previousBalance,
            newBalance:      result.newBalance,
        });
    } catch (error) {
        next(error);
    }
};

const getTopUpHistory = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 20;
        const history = await passengerService.getTopUpHistory(req.user.id, limit);

        res.status(200).json({
            success: true,
            history,
        });
    } catch (error) {
        next(error);
    }
};

const getTopUpByRef = async (req, res, next) => {
    try {
        const { ref } = req.params;
        const receipt = await passengerService.getTopUpByRef(req.user.id, ref);

        res.status(200).json({
            success: true,
            receipt,
        });
    } catch (error) {
        next(error);
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Normalises the raw DB row into a clean API response shape. */
const _formatProfile = (row) => ({
    userId: row.UserId,
    email: row.Email,
    fullName: row.FullName,
    role: row.Role,
    memberSince: row.MemberSince,
    phone: row.Phone || null,
    address: row.Address || null,
    dateOfBirth: row.DateOfBirth || null,
    nic: row.NIC || null,
    avatarUrl: row.AvatarUrl || null,
    account: {
        id: row.AccountId,
        balance: row.Balance != null ? Number(row.Balance) : 0,
        currency: row.Currency || 'LKR',
        status: row.AccountStatus,
    },
});

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    topUpAccount,
    getTopUpHistory,
    getTopUpByRef,
};