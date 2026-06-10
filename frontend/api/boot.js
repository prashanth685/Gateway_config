import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { env } from "./lib/env.js";
import { mqttClient } from "./lib/mqttClient.js";
import { mqttEmitter } from "./lib/mqttEmitter.js";

const app = new Hono();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// SSE endpoint for real-time MQTT message streaming
app.get("/api/events", async (c) => {
  const gateway = c.req.query("gateway");
  if (!gateway) {
    return c.json({ error: "Missing gateway query parameter" }, 400);
  }

  // Validate gateway prefix format (alphanumeric + _ -)
  if (!/^[a-zA-Z0-9_-]+$/.test(gateway)) {
    return c.json({ error: "Invalid gateway prefix format" }, 400);
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const initEvent = `data: ${JSON.stringify({ type: "connected", gateway })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initEvent));

      // Subscribe to all topics under this gateway prefix
      const mqttTopic = `${gateway}/#`;

      const handler = (data) => {
        try {
          const event = `data: ${JSON.stringify({
            type: "message",
            topic: data.topic,
            payload: data.message,
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(event));
        } catch {
          // Stream may be closed, ignore
        }
      };

      // Listen on the mqttEmitter for this gateway
      mqttEmitter.on(`gateway:${gateway}`, handler);

      // Subscribe via MQTT client
      const mqttCallback = (message, topic) => {
        mqttEmitter.emit(`gateway:${gateway}`, { topic, message });
      };

      mqttClient.subscribe(mqttTopic, mqttCallback);

      console.log(`[SSE] Client connected for gateway: ${gateway}`);

      // Handle client disconnect
      c.req.raw.signal.addEventListener("abort", () => {
        mqttEmitter.off(`gateway:${gateway}`, handler);
        mqttClient.unsubscribe(mqttTopic, mqttCallback);
        console.log(`[SSE] Client disconnected from gateway: ${gateway}`);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite.js");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
