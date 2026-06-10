require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./src/config/db");
const companyRoutes = require("./src/routes/companyRoutes");
const gatewayRoutes = require("./src/routes/gatewayRoutes");
const mqttRoutes = require("./src/routes/mqttRoutes");
const { mqttClient } = require("./src/lib/mqttClient");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Routes
app.use("/api/companies", companyRoutes);
app.use("/api/gateways", gatewayRoutes);
app.use("/api/mqtt", mqttRoutes);

// Health Check
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// SSE Endpoint for Real-time MQTT Messages
app.get("/api/events", (req, res) => {
  const gateway = req.query.gateway;
  if (!gateway || !/^[a-zA-Z0-9_-]+$/.test(gateway)) {
    return res
      .status(400)
      .json({ error: "Missing or invalid gateway parameter" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const initEvent = `data: ${JSON.stringify({ type: "connected", gateway })}\n\n`;
  res.write(initEvent);

  const mqttTopic = `${gateway}/#`;

  const handler = (data) => {
    const event = `data: ${JSON.stringify({
      type: "message",
      topic: data.topic,
      payload: data.message,
    })}\n\n`;
    res.write(event);
  };

  mqttClient.subscribe(mqttTopic, (message, topic) => {
    handler({ topic, message });
  });

  console.log(`[SSE] Client connected for gateway: ${gateway}`);

  req.on("close", () => {
    mqttClient.unsubscribe(mqttTopic);
    console.log(`[SSE] Client disconnected from gateway: ${gateway}`);
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
