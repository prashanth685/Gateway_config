import { createRouter, publicQuery } from "./middleware.js";
import { companyRouter } from "./routers/company.js";
import { gatewayRouter } from "./routers/gateway.js";
import { mqttRouter } from "./routers/mqtt.js";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  company: companyRouter,
  gateway: gatewayRouter,
  mqtt: mqttRouter,
});
