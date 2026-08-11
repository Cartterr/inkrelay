import path from "node:path";

import { closeDatabase, createDatabase, migrateDatabase } from "./client.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations");
const connection = createDatabase(databaseUrl);
try {
  await migrateDatabase(connection, path.resolve(process.cwd(), "packages/db/migrations"));
} finally {
  await closeDatabase(connection);
}
