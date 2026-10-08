const express = require("express");

const { authenticateToken } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const inspectorController = require("../controllers/inspector.controller");

const router = express.Router();

// Reports are for managers / admins in the web portal, never for inspectors or passengers
router.use(authenticateToken, requireRole("Manager", "Admin"));

// GET /api/reports/invalid-tickets?from=YYYY-MM-DD&to=YYYY-MM-DD&route=177
router.get("/invalid-tickets", inspectorController.getInvalidTicketReport);

module.exports = router;
