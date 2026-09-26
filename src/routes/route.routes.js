const express = require("express");

const routeController = require("../controllers/route.controller");
const { authenticateToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", authenticateToken, routeController.getAll);
router.post("/", authenticateToken, routeController.create);
router.put("/:id", authenticateToken, routeController.update);
router.put("/:id/status", authenticateToken, routeController.updateStatus);

module.exports = router;
