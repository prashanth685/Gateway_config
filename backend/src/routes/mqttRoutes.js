const express = require("express");
const router = express.Router();
const { publish } = require("../controllers/mqttController");

router.post("/publish", publish); // Now accepts array of middlewares

module.exports = router;
