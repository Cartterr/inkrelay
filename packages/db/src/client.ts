import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import * as schema from "./schema.js";

const { Pool } = pg;

export function validateDatabaseUrl(databaseUrl: string): URL {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres protocol");
  }
  return url;
}

export function createDatabase(databaseUrl: string) {
  validateDatabaseUrl(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl, max: 12, idleTimeoutMillis: 30_000 });
  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;

export async function migrateDatabase(
  connection: DatabaseConnection,
  migrationsFolder: string,
): Promise<void> {
  await migrate(connection.db, { migrationsFolder });
}

export async function checkDatabaseReady(connection: DatabaseConnection): Promise<boolean> {
  try {
    await connection.pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(connection: DatabaseConnection): Promise<void> {
  await connection.pool.end();
}
