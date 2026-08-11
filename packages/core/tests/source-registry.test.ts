import { describe, expect, test } from "vitest";

import { SOURCE_CATEGORIES, SOURCES } from "../src/sources.js";

describe("source registry", () => {
  test("contains exactly the 58 KTool-confirmed active sources", () => {
    expect(SOURCES).toHaveLength(58);
    expect(new Set(SOURCES.map((source) => source.id)).size).toBe(58);
    expect(new Set(SOURCES.map((source) => source.slug)).size).toBe(58);
    expect(SOURCES.every((source) => source.enabled)).toBe(true);
  });

  test("contains only supported ingestion methods and categories", () => {
    expect(SOURCES.filter((source) => source.ingestion.kind === "hacker-news")).toHaveLength(1);
    expect(SOURCES.filter((source) => source.ingestion.kind === "autodiscover")).toHaveLength(2);
    expect(SOURCES.every((source) => SOURCE_CATEGORIES.includes(source.category))).toBe(true);
  });

  test("excludes known failed and pending sources", () => {
    const serialized = JSON.stringify(SOURCES).toLowerCase();
    expect(serialized).not.toContain("jvns.ca");
    expect(serialized).not.toContain("gamedevelopersconference");
    expect(serialized).not.toContain("artofvfx.com");
    expect(serialized).not.toContain("indiegamebusiness");
  });
});
