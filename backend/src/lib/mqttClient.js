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
      const matchingKeys = this._getMatchingCallbackKeys(topic);
      matchingKeys.forEach(key => {
        const cbs = this.callbacks.get(key);
        if (cbs) cbs.forEach((cb) => cb(message, topic));
      });
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

  // Find all callback keys that match the incoming topic (handles wildcards)
  _getMatchingCallbackKeys(topic) {
    const matchingKeys = [];
    
    // Check exact match first
    if (this.callbacks.has(topic)) {
      matchingKeys.push(topic);
    }
    
    // Check wildcard matches
    for (const key of this.callbacks.keys()) {
      if (key.includes('+') || key.includes('#')) {
        if (this._topicMatchesPattern(topic, key)) {
          matchingKeys.push(key);
        }
      }
    }
    
    return matchingKeys;
  }

  // Check if a topic matches a wildcard pattern
  _topicMatchesPattern(topic, pattern) {
    const topicParts = topic.split('/');
    const patternParts = pattern.split('/');
    
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const topicPart = topicParts[i];
      
      if (patternPart === '#') {
        // # matches everything to the end
        return true;
      }
      
      if (patternPart === '+') {
        // + matches any single level
        if (topicPart === undefined) {
          return false;
        }
      } else {
        // Exact match required
        if (patternPart !== topicPart) {
          return false;
        }
      }
    }
    
    // If pattern has more parts than topic, it doesn't match (unless last is #)
    if (patternParts.length > topicParts.length && patternParts[patternParts.length - 1] !== '#') {
      return false;
    }
    
    return true;
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
