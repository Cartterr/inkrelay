import { getTableName } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
  articles,
  auditEvents,
  covers,
  evaluations,
  feedCursors,
  sources,
  weeklyEditions,
  weeklySelections,
  workerHeartbeats,
} from "../src/schema.js";

describe("database schema", () => {
  test("defines the persistent product records", () => {
    expect(
      [
        sources,
        feedCursors,
        articles,
        evaluations,
        covers,
        weeklyEditions,
        weeklySelections,
        auditEvents,
        workerHeartbeats,
      ].map(getTableName),
    ).toEqual([
      "sources",
      "feed_cursors",
      "articles",
      "evaluations",
      "covers",
      "weekly_editions",
      "weekly_selections",
      "audit_events",
      "worker_heartbeats",
    ]);
  });
});
