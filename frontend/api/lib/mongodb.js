import { MongoClient, ObjectId } from "mongodb";
import { env } from "./env.js";

let client = null;
let db = null;

export async function getMongoDb() {
  if (db) return db;

  if (!env.mongodbUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  client = new MongoClient(env.mongodbUri);
  await client.connect();
  db = client.db();

  // Ensure unique index on gateways.prefix
  const gateways = db.collection("gateways");
  await gateways.createIndex({ prefix: 1 }, { unique: true });

  console.log("[MongoDB] Connected and indexes ensured");
  return db;
}

export function getObjectId(id) {
  return new ObjectId(id);
}

// Graceful shutdown
process.on("SIGINT", async () => {
  if (client) {
    await client.close();
    console.log("[MongoDB] Connection closed");
  }
  process.exit(0);
});
