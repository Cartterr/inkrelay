import { randomUUID } from "node:crypto";

import { parseRuntimeConfig, SOURCES } from "@inkrelay/core";
import {
  closeDatabase,
  createDatabase,
  heartbeat,
  latestPublishedEditionId,
  migrateDatabase,
  seedSourceRegistry,
} from "@inkrelay/db";
import { databaseMigrationsPath } from "@inkrelay/db/migration-path";
import { S3AssetStore } from "@inkrelay/rendering";
import { PgBoss } from "pg-boss";

import { createAiProvider, registerHandlers } from "./handlers.js";
import { enqueueLatestEditionCoverUpgrade } from "./cover-upgrade.js";
import { SesKindleDeliveryProvider } from "./kindle.js";
import { createLogger } from "./logging.js";
import { DEFAULT_JOB_OPTIONS, ensureQueues } from "./queue.js";

const config = parseRuntimeConfig(process.env);
const logger = createLogger(config.logLevel);
const connection = createDatabase(config.databaseUrl);
await migrateDatabase(connection, databaseMigrationsPath);
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
  kindleProvider: config.kindleDelivery
    ? new SesKindleDeliveryProvider(config.kindleDelivery)
    : null,
  logger,
});

const upgradedCoverCount = await enqueueLatestEditionCoverUpgrade(boss, connection);
if (upgradedCoverCount > 0) {
  logger.info({ coverCount: upgradedCoverCount }, "cover.upgrade_enqueued");
}

if (config.kindleDelivery) {
  const editionId = await latestPublishedEditionId(connection);
  if (editionId) {
    await boss.send(
      "deliver-edition",
      { editionId },
      {
        ...DEFAULT_JOB_OPTIONS,
        retryLimit: 3,
        singletonKey: `delivery:${editionId}`,
      },
    );
  }
}

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
