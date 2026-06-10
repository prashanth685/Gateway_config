import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware.js";
import { mqttClient } from "../lib/mqttClient.js";

export const mqttRouter = createRouter({
  publish: publicQuery
    .input(
      z.object({
        topic: z.string().min(1, "Topic is required").max(200),
        payload: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      if (!mqttClient.isConnected()) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "MQTT broker not connected",
        });
      }

      // If publishing config, validate the schema structure of the flat string
      if (input.topic.endsWith("/Setconfig")) {
        try {
          let raw = input.payload.trim();
          if (raw.startsWith('"') && raw.endsWith('"')) {
            raw = raw.slice(1, -1);
          } else {
            throw new Error("Payload must be wrapped in double quotes");
          }

          // Split values by ","
          const items = raw.split('","');
          if (items.length === 0 || items.length % 12 !== 0) {
            throw new Error(`Payload must contain exactly 12 fields per row, got ${items.length} fields total`);
          }

          // Validate each row of 12 fields
          for (let i = 0; i < items.length; i += 12) {
            const parameterName = items[i];
            const deviceName = items[i+1];
            const slaveId = parseInt(items[i+2], 10);
            const functionCode = parseInt(items[i+3], 10);
            const address = parseInt(items[i+4], 10);
            const length = parseInt(items[i+5], 10);
            const dataType = items[i+6].toLowerCase();
            const scaleFactor = parseFloat(items[i+7]);
            const baudRate = parseInt(items[i+8], 10);
            const dataBits = parseInt(items[i+9], 10);
            const parity = items[i+10].toLowerCase();
            const stopBits = parseInt(items[i+11], 10);

            if (!parameterName) throw new Error("Parameter Name cannot be empty");
            if (!deviceName) throw new Error("Device Name cannot be empty");
            if (isNaN(slaveId) || slaveId < 0 || slaveId > 255) throw new Error(`Invalid Slave ID: ${items[i+2]}`);
            if (isNaN(functionCode) || functionCode < 0 || functionCode > 255) throw new Error(`Invalid Function Code: ${items[i+3]}`);
            if (isNaN(address) || address < 0 || address > 65535) throw new Error(`Invalid Address: ${items[i+4]}`);
            if (isNaN(length) || length < 1 || length > 65535) throw new Error(`Invalid Length: ${items[i+5]}`);
            if (dataType !== "int" && dataType !== "float") throw new Error(`Invalid Data Type: ${items[i+6]}`);
            if (isNaN(scaleFactor)) throw new Error(`Invalid Scale Factor: ${items[i+7]}`);
            if (isNaN(baudRate) || baudRate <= 0) throw new Error(`Invalid Baud Rate: ${items[i+8]}`);
            if (isNaN(dataBits) || dataBits < 0 || dataBits > 255) throw new Error(`Invalid Data Bits: ${items[i+9]}`);
            if (parity !== "none" && parity !== "even" && parity !== "odd") throw new Error(`Invalid Parity: ${items[i+10]}`);
            if (isNaN(stopBits) || stopBits < 1 || stopBits > 2) throw new Error(`Invalid Stop Bits: ${items[i+11]}`);
          }
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid configuration format: ${err.message}`,
          });
        }
      }

      try {
        await mqttClient.publish(input.topic, input.payload);
        return { success: true };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to publish: ${err.message}`,
        });
      }
    }),
});
