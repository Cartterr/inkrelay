import { parseRuntimeConfig, SOURCES } from "@inkrelay/core";
import { PgBoss } from "pg-boss";

import { createLogger } from "./logging.js";
import { DEFAULT_JOB_OPTIONS, ensureQueues } from "./queue.js";
import { buildSchedulePlan } from "./scheduler.js";

const config = parseRuntimeConfig(process.env);
const logger = createLogger(config.logLevel);
const boss = new PgBoss({ connectionString: config.databaseUrl, schema: "pgboss" });
await boss.start();
await ensureQueues(boss);

const plan = buildSchedulePlan(new Date(), SOURCES);
let enqueued = 0;
for (const item of plan) {
  const id = await boss.send(item.name, item.data, {
    ...DEFAULT_JOB_OPTIONS,
    retryLimit: item.retryLimit,
    singletonKey: item.singletonKey,
  });
  if (id) enqueued += 1;
}
logger.info({ dueJobs: plan.length, enqueued }, "scheduler.completed");
await boss.stop({ graceful: true, timeout: 10_000 });
