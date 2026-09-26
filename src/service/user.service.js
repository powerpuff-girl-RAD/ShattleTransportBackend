const bcrypt = require("bcryptjs");

const authRepository = require("../repository/auth.repository");
const userRepository = require("../repository/user.repository");
const emailService = require("./email.service");

const CREDENTIAL_EMAIL_ROLES = ["admin", "manager", "inspector"];


// GET ALL
const getAllEmployees = async () => {

    return await userRepository.getAll();
};


// CREATE
const createEmployee = async ({ email, password, fullName, role }) => {

    if (!email || !password) {

        const error = new Error("Email and password are required");

        error.statusCode = 400;

        throw error;
    }

    const existing = await authRepository.findByEmail(email);

    if (existing) {

        const error = new Error("Email already registered");

        error.statusCode = 409;

        throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await authRepository.createUser({ email, passwordHash, fullName, role });

    if (CREDENTIAL_EMAIL_ROLES.includes((role || "").toLowerCase())) {

        await emailService.sendEmail(
            user.Email,
            `<p>Your account has been created.</p><p>Email: ${user.Email}</p><p>Password: ${password}</p>`
        );
    }

    return { id: user.Id, email: user.Email, fullName: user.FullName, role: user.Role };
};


// UPDATE
const updateEmployee = async (id, { email, fullName, role, status }) => {

    if (!email) {

        const error = new Error("Email is required");

        error.statusCode = 400;

        throw error;
    }

    const existing = await authRepository.findById(id);

    if (!existing) {

        const error = new Error("Employee not found");

        error.statusCode = 404;

        throw error;
    }

    const updated = await userRepository.update(id, { email, fullName, role, status });

    return {
        id: updated.Id,
        fullName: updated.FullName,
        email: updated.Email,
        role: updated.Role,
        status: updated.Status,
        statusName: updated.StatusName,
        createdAt: updated.CreatedAt
    };
};


// DELETE
const deleteEmployee = async (id) => {

    const existing = await authRepository.findById(id);

    if (!existing) {

        const error = new Error("Employee not found");

        error.statusCode = 404;

        throw error;
    }

    await userRepository.remove(id);
};


module.exports = {
    getAllEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee
};
