const express = require("express");

const fareController = require("../controllers/fare.controller");
const { authenticateToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", authenticateToken, fareController.getAll);
router.post("/", authenticateToken, fareController.create);
router.put("/", authenticateToken, fareController.update);

module.exports = router;