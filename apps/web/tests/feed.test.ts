import { describe, expect, test } from "vitest";

import { slugify, toPublishedFeedEntries } from "../lib/feed.js";

describe("web feed projection", () => {
  test("uses opaque article and asset identifiers without a feed key", () => {
    const entries = toPublishedFeedEntries(
      [
        {
          articleId: "article-id",
          articleAccessId: "opaque-article",
          sourceId: "source-id",
          sourceName: "Source",
          title: "GPU Rendering & Production",
          summary: "A complete technical summary.",
          contentHtml: "<p>Complete body.</p>",
          originalUrl: "https://source.example/article",
          assetAccessId: "opaque-asset",
          publishedAt: new Date("2026-08-11T12:00:00.000Z"),
        },
      ],
      "https://inkrelay.example",
    );
    expect(entries[0]?.articleAccessId).toBe("opaque-article");
    expect(entries[0]?.coverUrl).toBe("https://inkrelay.example/assets/opaque-asset");
    expect(JSON.stringify(entries)).not.toContain("feedKey");
  });

  test("does not publish entries with missing bodies or summaries", () => {
    const entries = toPublishedFeedEntries(
      [
        {
          articleId: "article-id",
          articleAccessId: "opaque-article",
          sourceId: "source-id",
          sourceName: "Source",
          title: "Incomplete article",
          summary: null,
          contentHtml: null,
          originalUrl: "https://source.example/article",
          assetAccessId: "opaque-asset",
          publishedAt: new Date(),
        },
      ],
      "https://inkrelay.example",
    );
    expect(entries).toEqual([]);
  });

  test("creates stable readable slugs", () => {
    expect(slugify("GPU Rendering & Production — 2026")).toBe("gpu-rendering-production-2026");
  });
});
