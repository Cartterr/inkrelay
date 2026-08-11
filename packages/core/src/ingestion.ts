import { JSDOM } from "jsdom";
import Parser from "rss-parser";

export interface FeedEntry {
  externalId: string;
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string | null;
}

export interface FeedCacheState {
  etag?: string | null;
  lastModified?: string | null;
}

const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"]);

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function discoverFeedUrl(html: string, pageUrl: string): string | null {
  const document = new JSDOM(html, { url: pageUrl }).window.document;
  const candidates = document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate"][href]');
  for (const candidate of candidates) {
    const type = candidate.type.toLowerCase();
    if (type === "application/rss+xml" || type === "application/atom+xml") {
      return new URL(candidate.href, pageUrl).toString();
    }
  }
  return null;
}

export function buildConditionalHeaders(state: FeedCacheState): Record<string, string> {
  const headers: Record<string, string> = {};
  if (state.lastModified) headers["If-Modified-Since"] = state.lastModified;
  if (state.etag) headers["If-None-Match"] = state.etag;
  return headers;
}

export async function parseFeedXml(xml: string, sourceId: string): Promise<FeedEntry[]> {
  const parser = new Parser();
  const feed = await parser.parseString(xml);
  return feed.items.flatMap((item) => {
    if (!item.link || !item.title) return [];
    const url = canonicalizeUrl(item.link);
    return [
      {
        externalId: item.guid ?? item.id ?? url,
        sourceId,
        title: item.title.trim(),
        url,
        publishedAt: normalizeDate(item.isoDate ?? item.pubDate),
        excerpt: item.contentSnippet?.trim() || item.content?.trim() || null,
      },
    ];
  });
}

interface HackerNewsItem {
  id: number;
  title?: string;
  url?: string;
  time?: number;
  deleted?: boolean;
  dead?: boolean;
}

export function parseHackerNewsItems(items: HackerNewsItem[]): FeedEntry[] {
  return items.flatMap((item) => {
    if (item.deleted || item.dead || !item.title || !item.url) return [];
    return [
      {
        externalId: `hn:${item.id}`,
        sourceId: "hacker-news-best",
        title: item.title.trim(),
        url: canonicalizeUrl(item.url),
        publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null,
        excerpt: null,
      },
    ];
  });
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
