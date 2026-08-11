import { describe, expect, test } from "vitest";

import { extractArticle } from "../src/extraction.js";

const fixtures = [
  ["AI", "Transformer inference architecture and benchmark methodology"],
  ["SIGGRAPH", "Path tracing, sampling, and production rendering diagrams"],
  ["VFX", "Compositing pipelines, color management, and shot production"],
  ["Engineering", "Distributed systems architecture and incident analysis"],
  ["Gaming", "Game engine design, level tooling, and frame pacing"],
  ["Substack", "A detailed independent technical analysis with original data"],
] as const;

describe("representative extraction fixtures", () => {
  test.each(fixtures)(
    "extracts a meaningful %s body instead of a title-only page",
    (kind, subject) => {
      const paragraphs = Array.from(
        { length: 12 },
        (_, index) =>
          `<p>${subject}. Section ${index + 1} explains implementation tradeoffs, measurements, constraints, and conclusions for experienced readers.</p>`,
      ).join("");
      const extracted = extractArticle(
        `<html><head><title>${kind} Technical Feature</title></head><body><article><h1>${kind} Technical Feature</h1>${paragraphs}</article></body></html>`,
        `https://fixtures.example/${kind.toLowerCase()}`,
      );
      expect(extracted.wordCount).toBeGreaterThan(150);
      expect(extracted.contentHtml).toContain("implementation tradeoffs");
      expect(extracted.title).toContain(kind);
    },
  );
});
