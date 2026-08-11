import { describe, expect, test } from "vitest";

import {
  evaluateDeterministically,
  selectWeeklyEdition,
  type SelectionCandidate,
} from "../src/curation.js";

describe("deterministic evaluation", () => {
  test("rewards substantial illustrated technical writing", () => {
    const evaluation = evaluateDeterministically({
      title: "A Technical Deep Dive into Neural Rendering Architecture",
      excerpt: "Implementation details, benchmarks, algorithms, and diagrams.",
      wordCount: 2_400,
      imageCount: 5,
      publishedAt: "2026-08-10T12:00:00.000Z",
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    expect(evaluation.total).toBeGreaterThanOrEqual(75);
    expect(evaluation.penalties).toEqual([]);
  });

  test("penalizes tiny announcements and podcast-only titles", () => {
    const evaluation = evaluateDeterministically({
      title: "Podcast: release announcement",
      excerpt: "Listen now.",
      wordCount: 120,
      imageCount: 0,
      publishedAt: "2026-08-10T12:00:00.000Z",
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    expect(evaluation.total).toBeLessThan(40);
    expect(evaluation.penalties).toContain("short-content");
    expect(evaluation.penalties).toContain("podcast-or-announcement");
  });
});

describe("weekly selection", () => {
  test("selects exactly ten distinct sources while respecting category diversity", () => {
    const candidates = makeCandidates(12);
    const edition = selectWeeklyEdition(candidates, {
      editionId: "2026-W33",
      publishedAt: "2026-08-15T22:00:00.000Z",
    });
    expect(edition.selections).toHaveLength(10);
    expect(new Set(edition.selections.map((item) => item.sourceId)).size).toBe(10);
    const categoryCounts = Object.groupBy(edition.selections, (item) => item.category);
    expect(
      Math.max(...Object.values(categoryCounts).map((items) => items?.length ?? 0)),
    ).toBeLessThanOrEqual(3);
    expect(edition.status).toBe("published");
  });

  test("includes locked candidates and excludes suppressed candidates", () => {
    const candidates = makeCandidates(12);
    candidates[11] = { ...candidates[11], score: 1, override: "lock" };
    candidates[0] = { ...candidates[0], score: 100, override: "suppress" };
    const edition = selectWeeklyEdition(candidates, {
      editionId: "2026-W33",
      publishedAt: "2026-08-15T22:00:00.000Z",
    });
    expect(edition.selections.map((item) => item.articleId)).toContain("article-12");
    expect(edition.selections.map((item) => item.articleId)).not.toContain("article-1");
  });

  test("fails closed if ten valid distinct sources are unavailable", () => {
    expect(() =>
      selectWeeklyEdition(makeCandidates(9), {
        editionId: "2026-W33",
        publishedAt: "2026-08-15T22:00:00.000Z",
      }),
    ).toThrow("10 valid distinct-source candidates");
  });

  test("preserves every suitable editorial category before adding extra depth", () => {
    const categories = [
      "ai",
      "ai",
      "ai",
      "ai",
      "software",
      "software",
      "software",
      "software",
      "graphics",
      "vfx",
      "gaming",
      "robotics",
      "hardware",
    ] as const;
    const candidates: SelectionCandidate[] = categories.map((category, index) => ({
      articleId: `coverage-${index}`,
      sourceId: `coverage-source-${index}`,
      category,
      score: 100 - index,
      publishedAt: new Date(Date.UTC(2026, 7, 11 - index)).toISOString(),
      duplicateKey: `coverage-subject-${index}`,
      override: "none",
    }));
    const edition = selectWeeklyEdition(candidates, {
      editionId: "2026-W33",
      publishedAt: "2026-08-15T22:00:00.000Z",
    });
    expect(new Set(edition.selections.map((item) => item.category))).toEqual(
      new Set(["ai", "software", "graphics", "vfx", "gaming", "robotics", "hardware"]),
    );
  });
});

function makeCandidates(count: number): SelectionCandidate[] {
  const categories = ["ai", "software", "graphics", "gaming"] as const;
  return Array.from({ length: count }, (_, index) => ({
    articleId: `article-${index + 1}`,
    sourceId: `source-${index + 1}`,
    category: categories[index % categories.length],
    score: 100 - index,
    publishedAt: new Date(Date.UTC(2026, 7, 11 - index)).toISOString(),
    duplicateKey: `subject-${index + 1}`,
    override: "none",
  }));
}
