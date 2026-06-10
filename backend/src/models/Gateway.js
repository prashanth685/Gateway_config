const mongoose = require("mongoose");

const gatewaySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  prefix: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50,
    match: /^[a-zA-Z0-9_-]+$/,
  },
  label: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Gateway", gatewaySchema);
