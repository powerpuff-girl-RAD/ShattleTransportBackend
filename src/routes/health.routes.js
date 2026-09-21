const express = require("express");

const router = express.Router();

const healthController =
    require("../controllers/health.controller");


router.get("/", healthController.getAll);

router.get("/:id", healthController.getById);

router.post("/", healthController.create);

router.put("/:id", healthController.update);

router.delete("/:id", healthController.remove);


module.exports = router;