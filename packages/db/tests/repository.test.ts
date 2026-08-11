import { describe, expect, test } from "vitest";

import { assertPublicationSet } from "../src/repository.js";

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
