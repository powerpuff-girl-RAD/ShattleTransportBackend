const authService = require("../service/auth.service");
const authRepository = require("../repository/auth.repository");

const register = async (req, res, next) => {
    try {
        const { email, password, fullName } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters"
            });
        }

        const result = await authService.register({ email, password, fullName });

        res.status(201).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const result = await authService.login({ email, password });

        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

const refresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        const result = await authService.refresh(refreshToken);

        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        await authService.logout(req.user.id);

        res.status(200).json({ success: true, message: "Logged out" });
    } catch (error) {
        next(error);
    }
};

const me = async (req, res, next) => {
    try {
        const user = await authRepository.findById(req.user.id);

        res.status(200).json({
            success: true,
            user: { id: user.Id, email: user.Email, role: user.Role }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    login,
    refresh,
    logout,
    me
};