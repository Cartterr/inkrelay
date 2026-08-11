import { describe, expect, test } from "vitest";

import {
  generateFeedAccessKey,
  generateOpaqueId,
  hashIdentifier,
  verifyFeedAccessKey,
} from "../src/access.js";
import { renderSourceFeed, renderWeeklyFeed, type PublishedFeedEntry } from "../src/feeds.js";

describe("opaque access", () => {
  test("generates 256-bit feed keys and independent opaque article identifiers", () => {
    const feedKey = generateFeedAccessKey();
    const articleId = generateOpaqueId();
    expect(Buffer.from(feedKey, "base64url")).toHaveLength(32);
    expect(Buffer.from(articleId, "base64url")).toHaveLength(24);
    expect(articleId).not.toContain(feedKey);
  });

  test("verifies feed keys without storing the original value", () => {
    const feedKey = generateFeedAccessKey();
    const digest = hashIdentifier(feedKey);
    expect(verifyFeedAccessKey(feedKey, digest)).toBe(true);
    expect(verifyFeedAccessKey("wrong-key", digest)).toBe(false);
  });
});

describe("proxy feeds", () => {
  test("emits valid-looking source XML with stable GUIDs and escaped metadata", () => {
    const xml = renderSourceFeed({
      title: "ACM SIGGRAPH & InkRelay",
      description: "Selected computer graphics reading",
      publicBaseUrl: "https://inkrelay.example",
      feedPath: "/f/secret/source/acm-siggraph.xml",
      entries: [entry(1, "acm-siggraph")],
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("ACM SIGGRAPH &amp; InkRelay");
    expect(xml).toContain('<guid isPermaLink="false">article-1</guid>');
    expect(xml).toContain("https://inkrelay.example/a/access-1/article-1");
    expect(xml).toContain("<content:encoded><![CDATA[");
    expect(xml).toContain("<p>Body 1</p>");
    expect(xml).toContain("https://inkrelay.example/assets/asset-1");
  });

  test("weekly feeds require exactly ten distinct-source entries", () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      entry(index + 1, `source-${index + 1}`),
    );
    const xml = renderWeeklyFeed({
      editionId: "2026-W33",
      publicBaseUrl: "https://inkrelay.example",
      feedPath: "/f/secret/weekly.xml",
      entries,
    });
    expect(xml.match(/<item>/gu)).toHaveLength(10);
    expect(() =>
      renderWeeklyFeed({
        editionId: "2026-W33",
        publicBaseUrl: "https://inkrelay.example",
        feedPath: "/f/secret/weekly.xml",
        entries: entries.slice(0, 9),
      }),
    ).toThrow("exactly 10");
    expect(() =>
      renderWeeklyFeed({
        editionId: "2026-W33",
        publicBaseUrl: "https://inkrelay.example",
        feedPath: "/f/secret/weekly.xml",
        entries: entries.map((item) => ({ ...item, sourceId: "same-source" })),
      }),
    ).toThrow("distinct sources");
  });
});

function entry(index: number, sourceId: string): PublishedFeedEntry {
  return {
    articleId: `article-${index}`,
    articleAccessId: `access-${index}`,
    slug: `article-${index}`,
    sourceId,
    sourceName: `Source ${index}`,
    title: `Technical Article ${index}`,
    summary: `Summary ${index}`,
    contentHtml: `<p>Body ${index}</p>`,
    originalUrl: `https://source.example/article-${index}`,
    coverUrl: `https://inkrelay.example/assets/asset-${index}`,
    publishedAt: new Date(Date.UTC(2026, 7, index)).toISOString(),
  };
}
