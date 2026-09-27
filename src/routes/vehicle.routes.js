const express = require("express");

const vehicleController = require("../controllers/vehicle.controller");
const { authenticateToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", authenticateToken, vehicleController.getAll);
router.post("/", authenticateToken, vehicleController.create);
router.put("/:id", authenticateToken, vehicleController.update);
router.delete("/:id", authenticateToken, vehicleController.remove);

module.exports = router;