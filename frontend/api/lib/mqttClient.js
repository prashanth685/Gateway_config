import mqtt from "mqtt";
import { EventEmitter } from "events";
import { env } from "./env.js";

class MqttManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.callbacks = new Map();
    this.subscribedTopics = new Set();
    this.connecting = false;
    this.connect();
  }

  connect() {
    if (this.connecting || this.client?.connected) return;
    this.connecting = true;

    const options = {
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000,
    };

    if (env.mqttUsername) {
      options.username = env.mqttUsername;
    }
    if (env.mqttPassword) {
      options.password = env.mqttPassword;
    }

    console.log(`[MQTT] Connecting to ${env.mqttBrokerUrl}...`);
    this.client = mqtt.connect(env.mqttBrokerUrl, options);

    this.client.on("connect", () => {
      console.log("[MQTT] Connected to broker");
      this.connecting = false;
      this.emit("connect");

      // Re-subscribe to all previously subscribed topics
      for (const topic of this.subscribedTopics) {
        this.client?.subscribe(topic, (err) => {
          if (err) {
            console.error(`[MQTT] Failed to re-subscribe to ${topic}:`, err.message);
          } else {
            console.log(`[MQTT] Re-subscribed to ${topic}`);
          }
        });
      }
    });

    this.client.on("message", (topic, payload) => {
      const message = payload.toString();
      // Route to all callbacks registered for this topic
      const cbs = this.callbacks.get(topic);
      if (cbs) {
        cbs.forEach((cb) => {
          try {
            cb(message, topic);
          } catch (err) {
            console.error("[MQTT] Callback error:", err);
          }
        });
      }
      // Also route wildcard subscribers
      this.callbacks.forEach((cbs, registeredTopic) => {
        if (registeredTopic !== topic && this.topicMatches(registeredTopic, topic)) {
          cbs.forEach((cb) => {
            try {
              cb(message, topic);
            } catch (err) {
              console.error("[MQTT] Wildcard callback error:", err);
            }
          });
        }
      });
    });

    this.client.on("error", (err) => {
      console.error("[MQTT] Error:", err.message);
      this.connecting = false;
      this.emit("error", err);
    });

    this.client.on("close", () => {
      console.log("[MQTT] Connection closed");
      this.connecting = false;
      this.emit("disconnect");
    });

    this.client.on("offline", () => {
      console.log("[MQTT] Client offline");
    });
  }

  topicMatches(subscription, topic) {
    // Handle wildcard subscriptions like "DSA102/#"
    if (subscription.endsWith("/#")) {
      const prefix = subscription.slice(0, -2);
      return topic.startsWith(prefix + "/");
    }
    return subscription === topic;
  }

  isConnected() {
    return this.client?.connected ?? false;
  }

  async publish(topic, payload) {
    return new Promise((resolve, reject) => {
      if (!this.client?.connected) {
        reject(new Error("MQTT client not connected"));
        return;
      }
      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[MQTT] Publish error to ${topic}:`, err.message);
          reject(err);
        } else {
          console.log(`[MQTT] Published to ${topic}: ${payload.slice(0, 200)}`);
          resolve();
        }
      });
    });
  }

  subscribe(topic, callback) {
    // Add callback
    if (!this.callbacks.has(topic)) {
      this.callbacks.set(topic, new Set());
    }
    this.callbacks.get(topic).add(callback);

    // Subscribe on broker if not already
    if (!this.subscribedTopics.has(topic) && this.client?.connected) {
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`[MQTT] Subscribe error for ${topic}:`, err.message);
        } else {
          console.log(`[MQTT] Subscribed to ${topic}`);
          this.subscribedTopics.add(topic);
        }
      });
    } else if (this.subscribedTopics.has(topic)) {
      // Already subscribed on broker
    }
  }

  unsubscribe(topic, callback) {
    const cbs = this.callbacks.get(topic);
    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) {
        this.callbacks.delete(topic);
        // Unsubscribe from broker if no more callbacks
        if (this.subscribedTopics.has(topic) && this.client?.connected) {
          this.client.unsubscribe(topic, (err) => {
            if (err) {
              console.error(`[MQTT] Unsubscribe error for ${topic}:`, err.message);
            } else {
              console.log(`[MQTT] Unsubscribed from ${topic}`);
              this.subscribedTopics.delete(topic);
            }
          });
        }
      }
    }
  }
}

// Singleton instance
export const mqttClient = new MqttManager();
mqttClient.on("error", (err) => {
  console.warn("[MQTT] Connection or operation warning:", err.message);
});
