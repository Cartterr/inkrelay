import { getTableName } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
  articles,
  auditEvents,
  covers,
  editionDocumentDeliveries,
  editionDeliveries,
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
        editionDeliveries,
        editionDocumentDeliveries,
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
      "edition_deliveries",
      "edition_document_deliveries",
      "weekly_editions",
      "weekly_selections",
      "audit_events",
      "worker_heartbeats",
    ]);
  });
});
