import { initTRPC } from "@trpc/server";
import superjson from "superjson";

const t = initTRPC.context().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;
