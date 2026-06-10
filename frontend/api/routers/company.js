import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware.js";
import { getMongoDb, getObjectId } from "../lib/mongodb.js";

export const companyRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = await getMongoDb();
    const companies = await db
      .collection("companies")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    return companies.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      createdAt: c.createdAt,
    }));
  }),

  create: publicQuery
    .input(
      z.object({
        name: z.string().min(1, "Company name is required").max(100).transform((s) => s.trim()),
      })
    )
    .mutation(async ({ input }) => {
      if (!input.name) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Company name cannot be empty",
        });
      }
      const db = await getMongoDb();
      const result = await db.collection("companies").insertOne({
        name: input.name,
        createdAt: new Date(),
      });
      return {
        id: result.insertedId.toString(),
        name: input.name,
        createdAt: new Date(),
      };
    }),

  get: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getMongoDb();
      let company;
      try {
        company = await db.collection("companies").findOne({
          _id: getObjectId(input.id),
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Company not found",
        });
      }
      if (!company) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Company not found",
        });
      }
      return {
        id: company._id.toString(),
        name: company.name,
        createdAt: company.createdAt,
      };
    }),

  delete: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getMongoDb();
      const companyId = getObjectId(input.id);

      // Cascade delete: remove all associated gateways first
      const gatewaysDelete = await db.collection("gateways").deleteMany({
        companyId,
      });

      const companyDelete = await db.collection("companies").deleteOne({
        _id: companyId,
      });

      if (companyDelete.deletedCount === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Company not found",
        });
      }

      return {
        success: true,
        deletedGateways: gatewaysDelete.deletedCount,
      };
    }),
});
