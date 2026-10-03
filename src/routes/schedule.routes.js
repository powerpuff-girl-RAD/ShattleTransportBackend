const express = require("express");

const scheduleController = require("../controllers/schedule.controller");
const { authenticateToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", authenticateToken, scheduleController.getAll);
router.get("/:id", authenticateToken, scheduleController.getById);
router.post("/", authenticateToken, scheduleController.assign);
router.put("/:id", authenticateToken, scheduleController.update);
router.delete("/:id", authenticateToken, scheduleController.remove);

module.exports = router;
