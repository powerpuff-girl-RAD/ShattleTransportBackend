const { createError } = require("../utils/errors");

// Security tactic "Authorize users" (Lecture 7):
// authenticateToken proves WHO the caller is; requireRole proves they are ALLOWED.
// Must run after authenticateToken because it reads req.user.
const requireRole = (...allowedRoles) => {

    const allowed = allowedRoles.map((role) => role.toLowerCase());

    return (req, res, next) => {
        
        const role = (req.user?.role || "").toLowerCase();

        if (!allowed.includes(role)) {
            return next(createError(403, "You do not have permission to access this resource"));
        }

        next();
    };
};

module.exports = { requireRole };
