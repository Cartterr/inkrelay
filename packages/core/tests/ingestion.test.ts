import { describe, expect, test } from "vitest";

import {
  buildConditionalHeaders,
  canonicalizeUrl,
  discoverFeedUrl,
  parseFeedXml,
  parseHackerNewsItems,
} from "../src/ingestion.js";

describe("ingestion", () => {
  test("discovers an RSS or Atom URL from a source homepage", () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>`;
    expect(discoverFeedUrl(html, "https://example.com/articles/")).toBe(
      "https://example.com/feed.xml",
    );
  });

  test("parses RSS and normalizes entries", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title><item><guid>42</guid><title>Deep Dive</title><link>https://example.com/post?utm_source=x</link><pubDate>Mon, 10 Aug 2026 12:00:00 GMT</pubDate><description>Useful work</description></item></channel></rss>`;
    const entries = await parseFeedXml(xml, "source-1");
    expect(entries).toEqual([
      expect.objectContaining({
        externalId: "42",
        sourceId: "source-1",
        title: "Deep Dive",
        url: "https://example.com/post",
      }),
    ]);
  });

  test("parses Atom entries", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title><entry><id>tag:example,2026:7</id><title>Atom Deep Dive</title><link href="https://example.com/atom-post"/><updated>2026-08-10T12:00:00Z</updated><summary>Substantive work</summary></entry></feed>`;
    const entries = await parseFeedXml(xml, "atom-source");
    expect(entries[0]).toEqual(
      expect.objectContaining({
        externalId: "tag:example,2026:7",
        sourceId: "atom-source",
        title: "Atom Deep Dive",
        url: "https://example.com/atom-post",
      }),
    );
  });

  test("rejects malformed XML", async () => {
    await expect(parseFeedXml("<rss><channel><item>", "broken-source")).rejects.toThrow();
  });

  test("canonicalizes tracking parameters without changing meaningful query data", () => {
    expect(
      canonicalizeUrl("https://Example.com/post/?id=7&utm_medium=email&fbclid=secret#comments"),
    ).toBe("https://example.com/post?id=7");
  });

  test("builds conditional request headers", () => {
    expect(
      buildConditionalHeaders({ etag: '"abc"', lastModified: "Mon, 10 Aug 2026 12:00:00 GMT" }),
    ).toEqual({
      "If-Modified-Since": "Mon, 10 Aug 2026 12:00:00 GMT",
      "If-None-Match": '"abc"',
    });
  });

  test("normalizes valid Hacker News stories and ignores missing URLs", () => {
    const items = parseHackerNewsItems([
      { id: 1, title: "Technical Article", url: "https://example.com/story", time: 1_786_368_000 },
      { id: 2, title: "Ask HN", time: 1_786_368_001 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({ externalId: "hn:1", title: "Technical Article" }),
    );
  });
});
