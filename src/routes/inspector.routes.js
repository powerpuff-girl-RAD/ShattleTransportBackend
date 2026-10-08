const express = require("express");

const { authenticateToken } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const inspectorController = require("../controllers/inspector.controller");

const router = express.Router();

// Every inspector endpoint: logged in (authenticate) AND an Inspector (authorize)
router.use(authenticateToken, requireRole("Inspector"));

router.get("/dashboard", inspectorController.getDashboard);
router.post("/shift/start", inspectorController.startShift);
router.post("/shift/end", inspectorController.endShift);
router.post("/inspect", inspectorController.inspect);

router.get("/inspections", inspectorController.listInspections);
router.get("/inspections/:id", inspectorController.getInspection);

router.post("/violations", inspectorController.recordViolation);
router.get("/violations", inspectorController.listViolations);

router.get("/stats", inspectorController.getStats);
router.get("/schedule", inspectorController.getUpcomingSchedule);
router.put("/password", inspectorController.changePassword);

module.exports = router;
