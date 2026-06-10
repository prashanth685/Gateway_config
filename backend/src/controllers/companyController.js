const Company = require("../models/Company");
const Gateway = require("../models/Gateway");

exports.list = async (req, res) => {
  const companies = await Company.find().sort({ createdAt: -1 });
  res.json(companies);
};

exports.create = async (req, res) => {
  const { name } = req.body;
  const company = await Company.create({ name });
  res.status(201).json(company);
};

exports.getById = async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ error: "Company not found" });
  res.json(company);
};

exports.delete = async (req, res) => {
  await Gateway.deleteMany({ companyId: req.params.id });
  const result = await Company.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: "Company not found" });
  res.json({ success: true });
};
