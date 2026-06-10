const { mqttClient } = require("../lib/mqttClient");
const { validateSetConfig } = require("../middleware/validateConfig");

exports.publish = [
  validateSetConfig, // ← Middleware added here
  async (req, res) => {
    const { topic, payload } = req.body;

    if (!mqttClient.isConnected()) {
      return res.status(503).json({ error: "MQTT broker not connected" });
    }

    try {
      await mqttClient.publish(topic, payload);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to publish: ${err.message}` });
    }
  },
];
