import path from "node:path";
import { randomUUID } from "node:crypto";

import { parseRuntimeConfig, SOURCES } from "@inkrelay/core";
import {
  closeDatabase,
  createDatabase,
  heartbeat,
  migrateDatabase,
  seedSourceRegistry,
} from "@inkrelay/db";
import { S3AssetStore } from "@inkrelay/rendering";
import { PgBoss } from "pg-boss";

import { createAiProvider, registerHandlers } from "./handlers.js";
import { createLogger } from "./logging.js";
import { ensureQueues } from "./queue.js";

const config = parseRuntimeConfig(process.env);
const logger = createLogger(config.logLevel);
const connection = createDatabase(config.databaseUrl);
await migrateDatabase(connection, path.resolve(process.cwd(), "packages/db/migrations"));
await seedSourceRegistry(connection, SOURCES);

const boss = new PgBoss({ connectionString: config.databaseUrl, schema: "pgboss" });
boss.on("error", (error) => logger.error({ errorCode: error.name }, "queue.error"));
await boss.start();
await ensureQueues(boss);

const store = new S3AssetStore({
  endpoint: config.storage.endpoint,
  region: config.storage.region,
  bucket: config.storage.bucket,
  accessKeyId: config.storage.accessKeyId,
  secretAccessKey: config.storage.secretAccessKey,
  forcePathStyle: config.storage.forcePathStyle,
});
await registerHandlers({
  boss,
  connection,
  config,
  store,
  provider: createAiProvider(config),
  logger,
});

const workerId = process.env.RAILWAY_REPLICA_ID ?? randomUUID();
const serviceVersion = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? "local";
const beat = async () =>
  heartbeat(connection, workerId, serviceVersion, boss.getWipData().length, 0);
await beat();
const heartbeatTimer = setInterval(() => void beat(), 30_000);
heartbeatTimer.unref();
logger.info({ sourceCount: SOURCES.length }, "worker.ready");

async function shutdown(signal: string) {
  logger.info({ signal }, "worker.stopping");
  clearInterval(heartbeatTimer);
  await boss.stop({ graceful: true, timeout: 30_000 });
  await closeDatabase(connection);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
