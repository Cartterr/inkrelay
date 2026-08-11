import { JOB_NAMES } from "@inkrelay/db";
import type { PgBoss } from "pg-boss";

export const DEAD_LETTER_QUEUE = "dead-letter";

export const DEFAULT_JOB_OPTIONS = Object.freeze({
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 20 * 60,
  deadLetter: DEAD_LETTER_QUEUE,
});

export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(DEAD_LETTER_QUEUE, { policy: "standard" });
  for (const name of JOB_NAMES) {
    await boss.createQueue(name, {
      policy: name === "poll-source" ? "key_strict_fifo" : "standard",
    });
  }
}
