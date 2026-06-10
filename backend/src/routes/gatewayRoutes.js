const express = require("express");
const router = express.Router();
const {
  listByCompany,
  create,
  getById,
  delete: deleteGateway,
} = require("../controllers/gatewayController");

router.get("/company/:companyId", listByCompany);
router.post("/", create);
router.get("/:id", getById);
router.delete("/:id", deleteGateway);

module.exports = router;
