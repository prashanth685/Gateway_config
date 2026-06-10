const mqtt = require("mqtt");
const EventEmitter = require("events");

class MqttManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.callbacks = new Map();
    this.subscribedTopics = new Set();
    this.connect();
  }

  connect() {
    const options = { reconnectPeriod: 5000, connectTimeout: 30000 };

    if (process.env.MQTT_USERNAME) options.username = process.env.MQTT_USERNAME;
    if (process.env.MQTT_PASSWORD) options.password = process.env.MQTT_PASSWORD;

    this.client = mqtt.connect(process.env.MQTT_BROKER_URL, options);

    this.client.on("connect", () => {
      console.log("[MQTT] Connected to broker");
    });

    this.client.on("message", (topic, payload) => {
      const message = payload.toString();
      const cbs = this.callbacks.get(topic);
      if (cbs) cbs.forEach((cb) => cb(message, topic));
    });

    this.client.on("error", (err) =>
      console.error("[MQTT] Error:", err.message),
    );
  }

  isConnected() {
    return this.client?.connected || false;
  }

  async publish(topic, payload) {
    return new Promise((resolve, reject) => {
      if (!this.client?.connected)
        return reject(new Error("MQTT client not connected"));
      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        err ? reject(err) : resolve();
      });
    });
  }

  subscribe(topic, callback) {
    if (!this.callbacks.has(topic)) this.callbacks.set(topic, new Set());
    this.callbacks.get(topic).add(callback);

    if (!this.subscribedTopics.has(topic) && this.client?.connected) {
      this.client.subscribe(topic);
      this.subscribedTopics.add(topic);
    }
  }

  unsubscribe(topic) {
    this.callbacks.delete(topic);
    if (this.subscribedTopics.has(topic) && this.client?.connected) {
      this.client.unsubscribe(topic);
      this.subscribedTopics.delete(topic);
    }
  }
}

const mqttClient = new MqttManager();
module.exports = { mqttClient };
