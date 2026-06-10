import { EventEmitter } from "events";

// Global EventEmitter that bridges MQTT messages to SSE consumers
// Events are scoped by gateway prefix: "gateway:{prefix}"
// Payload: { topic: string, message: string }
export const mqttEmitter = new EventEmitter();

// Helper to emit an MQTT message for a specific gateway prefix
export function emitGatewayMessage(prefix, topic, message) {
  mqttEmitter.emit(`gateway:${prefix}`, { topic, message });
}

// Helper to listen for messages for a specific gateway prefix
export function onGatewayMessage(prefix, handler) {
  mqttEmitter.on(`gateway:${prefix}`, handler);
}

// Helper to remove listener
export function offGatewayMessage(prefix, handler) {
  mqttEmitter.off(`gateway:${prefix}`, handler);
}
