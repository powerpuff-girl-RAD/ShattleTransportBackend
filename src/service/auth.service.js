const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const authRepository = require("../repository/auth.repository");
const env = require("../config/env");

const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user.Id, email: user.Email, role: user.Role },
        env.jwt.accessSecret,
        { expiresIn: env.jwt.accessExpiry }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user.Id },
        env.jwt.refreshSecret,
        { expiresIn: env.jwt.refreshExpiry }
    );
};

const register = async ({ email, password, fullName }) => {
    const existing = await authRepository.findByEmail(email);

    if (existing) {
        const error = new Error("Email already registered");
        error.statusCode = 409;
        throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await authRepository.createUser({ email, passwordHash, fullName });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await authRepository.updateRefreshToken(user.Id, refreshToken);

    return {
        accessToken,
        refreshToken,
        user: { id: user.Id, email: user.Email, role: user.Role }
    };
};

const login = async ({ email, password }) => {
    const user = await authRepository.findByEmail(email);

    // Same error whether the email doesn't exist or the password is wrong -
    // don't let a client tell which emails are registered
    if (!user) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
    }

    const validPassword = await bcrypt.compare(password, user.PasswordHash);

    if (!validPassword) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await authRepository.updateRefreshToken(user.Id, refreshToken);

    return {
        accessToken,
        refreshToken,
        user: { id: user.Id, email: user.Email, role: user.Role }
    };
};

const refresh = async (refreshToken) => {
    if (!refreshToken) {
        const error = new Error("Refresh token required");
        error.statusCode = 401;
        throw error;
    }

    let decoded;

    try {
        decoded = jwt.verify(refreshToken, env.jwt.refreshSecret);
    } catch {
        const error = new Error("Invalid or expired refresh token");
        error.statusCode = 403;
        throw error;
    }

    const user = await authRepository.findById(decoded.id);

    // Confirms the token matches what's stored, so a revoked or
    // rotated-out refresh token can't be reused
    if (!user || user.RefreshToken !== refreshToken) {
        const error = new Error("Refresh token not recognized");
        error.statusCode = 403;
        throw error;
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await authRepository.updateRefreshToken(user.Id, newRefreshToken);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

const logout = async (userId) => {
    await authRepository.updateRefreshToken(userId, null);
};

module.exports = {
    generateAccessToken,
    register,
    login,
    refresh,
    logout
};