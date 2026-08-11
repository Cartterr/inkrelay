import { describe, expect, test } from "vitest";

import { JOB_NAMES, parseJobPayload, retentionCutoff } from "../src/jobs.js";

describe("durable job contracts", () => {
  test("defines every production job name", () => {
    expect(JOB_NAMES).toEqual([
      "poll-source",
      "extract-article",
      "evaluate-article",
      "generate-cover",
      "publish-edition",
      "deliver-edition",
      "cleanup-retention",
    ]);
  });

  test("validates job payloads", () => {
    expect(parseJobPayload("poll-source", { sourceId: "acm-siggraph" })).toEqual({
      sourceId: "acm-siggraph",
    });
    expect(() => parseJobPayload("poll-source", { sourceId: "" })).toThrow();
    expect(() => parseJobPayload("publish-edition", { editionId: "" })).toThrow();
    expect(parseJobPayload("deliver-edition", { editionId: "2026-W33" })).toEqual({
      editionId: "2026-W33",
    });
  });

  test("expires article bodies and generated assets after 90 days", () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    expect(retentionCutoff(now).toISOString()).toBe("2026-05-13T12:00:00.000Z");
  });
});
