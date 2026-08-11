import { hashIdentifier } from "@inkrelay/core";
import type { JobName } from "@inkrelay/db";
import { PgBoss } from "pg-boss";

import { runtimeConfig } from "./runtime";

const ALLOWED_DASHBOARD_JOBS = new Set<JobName>([
  "extract-article",
  "evaluate-article",
  "generate-cover",
]);

export async function enqueueDashboardJob(name: JobName, articleId: string): Promise<void> {
  if (!ALLOWED_DASHBOARD_JOBS.has(name)) throw new Error("Unsupported dashboard job");
  const boss = new PgBoss({ connectionString: runtimeConfig().databaseUrl, schema: "pgboss" });
  await boss.start();
  try {
    await boss.send(
      name,
      { articleId, ...(name === "generate-cover" ? { force: true } : {}) },
      {
        retryLimit: 5,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 20 * 60,
        deadLetter: "dead-letter",
        singletonKey: `${name}:${hashIdentifier(articleId)}`,
      },
    );
  } finally {
    await boss.stop({ graceful: true, timeout: 5_000 });
  }
}
