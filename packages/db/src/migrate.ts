import { closeDatabase, createDatabase, migrateDatabase } from "./client.js";
import { databaseMigrationsPath } from "./migration-path.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations");
const connection = createDatabase(databaseUrl);
try {
  await migrateDatabase(connection, databaseMigrationsPath);
} finally {
  await closeDatabase(connection);
}
