const express = require("express");
const router = express.Router();
const {
  list,
  create,
  getById,
  delete: deleteCompany,
} = require("../controllers/companyController");

router.get("/", list);
router.post("/", create);
router.get("/:id", getById);
router.delete("/:id", deleteCompany);

module.exports = router;
