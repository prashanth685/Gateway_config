const Gateway = require("../models/Gateway");

exports.listByCompany = async (req, res) => {
  const gateways = await Gateway.find({ companyId: req.params.companyId }).sort(
    { createdAt: -1 },
  );
  res.json(gateways);
};

exports.create = async (req, res) => {
  try {
    const gateway = await Gateway.create(req.body);
    res.status(201).json(gateway);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Gateway prefix already exists" });
    }
    res.status(400).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  const gateway = await Gateway.findById(req.params.id).populate(
    "companyId",
    "name",
  );
  if (!gateway) return res.status(404).json({ error: "Gateway not found" });
  res.json(gateway);
};

exports.delete = async (req, res) => {
  const result = await Gateway.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: "Gateway not found" });
  res.json({ success: true });
};
