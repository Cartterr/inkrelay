import { describe, expect, test } from "vitest";

import { assertPublicationSet, extractionPublishedAtUpdate } from "../src/repository.js";

describe("extraction metadata updates", () => {
  test("preserves the feed publication date when page metadata omits it", () => {
    expect(extractionPublishedAtUpdate(null)).toBeUndefined();
    expect(extractionPublishedAtUpdate(undefined)).toBeUndefined();
  });

  test("uses a valid publication date discovered on the article page", () => {
    expect(extractionPublishedAtUpdate("2026-08-11T12:00:00.000Z")).toEqual(
      new Date("2026-08-11T12:00:00.000Z"),
    );
  });
});

describe("atomic publication guard", () => {
  test("accepts exactly ten distinct articles and sources", () => {
    const selection = Array.from({ length: 10 }, (_, index) => ({
      articleId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      sourceId: `source-${index}`,
      score: 90 - index,
      category: "ai" as const,
    }));
    expect(() => assertPublicationSet(selection)).not.toThrow();
  });

  test("rejects partial or duplicate-source publication", () => {
    const selection = Array.from({ length: 10 }, (_, index) => ({
      articleId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      sourceId: "same-source",
      score: 90,
      category: "ai" as const,
    }));
    expect(() => assertPublicationSet(selection.slice(0, 9))).toThrow("exactly 10");
    expect(() => assertPublicationSet(selection)).toThrow("distinct sources");
  });
});
