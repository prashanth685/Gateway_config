const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
    console.log("[MongoDB] Connected successfully");

    // Create unique index on gateway prefix
    await mongoose.connection.db
      .collection("gateways")
      .createIndex({ prefix: 1 }, { unique: true });
  } catch (err) {
    console.error("[MongoDB] Connection failed:", err);
    process.exit(1);
  }
};

module.exports = { connectDB };
