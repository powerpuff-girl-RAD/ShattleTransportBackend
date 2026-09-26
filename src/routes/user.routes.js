const express = require("express");

const userController = require("../controllers/user.controller");
const { authenticateToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", authenticateToken, userController.getAll);
router.post("/", authenticateToken, userController.create);
router.put("/:id", authenticateToken, userController.update);
router.delete("/:id", authenticateToken, userController.remove);

module.exports = router;
