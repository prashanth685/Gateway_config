import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware.js";
import { getMongoDb, getObjectId } from "../lib/mongodb.js";

export const gatewayRouter = createRouter({
  listByCompany: publicQuery
    .input(z.object({ companyId: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getMongoDb();
      const gateways = await db
        .collection("gateways")
        .find({ companyId: getObjectId(input.companyId) })
        .sort({ createdAt: -1 })
        .toArray();
      return gateways.map((g) => ({
        id: g._id.toString(),
        companyId: g.companyId.toString(),
        prefix: g.prefix,
        label: g.label,
        createdAt: g.createdAt,
      }));
    }),

  create: publicQuery
    .input(
      z.object({
        companyId: z.string().min(1),
        prefix: z
          .string()
          .min(1, "Prefix is required")
          .max(50)
          .regex(/^[a-zA-Z0-9_-]+$/, "Prefix must be alphanumeric with underscores or hyphens only"),
        label: z.string().min(1, "Label is required").max(200),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getMongoDb();

      try {
        const result = await db.collection("gateways").insertOne({
          companyId: getObjectId(input.companyId),
          prefix: input.prefix,
          label: input.label,
          createdAt: new Date(),
        });
        return {
          id: result.insertedId.toString(),
          companyId: input.companyId,
          prefix: input.prefix,
          label: input.label,
          createdAt: new Date(),
        };
      } catch (err) {
        // Check for duplicate key error (code 11000)
        if (err.code === 11000) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Gateway prefix already exists",
          });
        }
        throw err;
      }
    }),

  get: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getMongoDb();
      let gateway;
      try {
        gateway = await db.collection("gateways").findOne({
          _id: getObjectId(input.id),
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Gateway not found",
        });
      }
      if (!gateway) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Gateway not found",
        });
      }

      // Fetch parent company
      const company = await db.collection("companies").findOne({
        _id: gateway.companyId,
      });

      return {
        id: gateway._id.toString(),
        companyId: gateway.companyId.toString(),
        prefix: gateway.prefix,
        label: gateway.label,
        createdAt: gateway.createdAt,
        company: company
          ? {
              id: company._id.toString(),
              name: company.name,
            }
          : null,
      };
    }),

  delete: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getMongoDb();
      const result = await db.collection("gateways").deleteOne({
        _id: getObjectId(input.id),
      });
      if (result.deletedCount === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Gateway not found",
        });
      }
      return { success: true };
    }),
});
