export interface PublishedFeedEntry {
  articleId: string;
  articleAccessId: string;
  slug: string;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string;
  contentHtml: string;
  originalUrl: string;
  coverUrl: string;
  publishedAt: string;
}

export interface SourceFeedInput {
  title: string;
  description: string;
  publicBaseUrl: string;
  feedPath: string;
  entries: PublishedFeedEntry[];
}

export interface WeeklyFeedInput {
  editionId: string;
  publicBaseUrl: string;
  feedPath: string;
  entries: PublishedFeedEntry[];
}

export function renderSourceFeed(input: SourceFeedInput): string {
  return renderRss({
    title: input.title,
    description: input.description,
    publicBaseUrl: input.publicBaseUrl,
    feedPath: input.feedPath,
    entries: input.entries,
  });
}

export function renderWeeklyFeed(input: WeeklyFeedInput): string {
  if (input.entries.length !== 10) throw new Error("A weekly feed requires exactly 10 entries");
  if (new Set(input.entries.map((entry) => entry.sourceId)).size !== 10) {
    throw new Error("A weekly feed requires entries from 10 distinct sources");
  }
  return renderRss({
    title: `InkRelay Weekly — ${input.editionId}`,
    description: "Ten carefully selected technical articles for Kindle.",
    publicBaseUrl: input.publicBaseUrl,
    feedPath: input.feedPath,
    entries: input.entries,
  });
}

function renderRss(input: SourceFeedInput): string {
  const baseUrl = input.publicBaseUrl.replace(/\/$/u, "");
  const feedUrl = new URL(input.feedPath, `${baseUrl}/`).toString();
  const items = input.entries.map((entry) => renderItem(entry, baseUrl)).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "<channel>",
    `<title>${escapeXml(input.title)}</title>`,
    `<link>${escapeXml(baseUrl)}</link>`,
    `<description>${escapeXml(input.description)}</description>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    "<ttl>60</ttl>",
    items,
    "</channel>",
    "</rss>",
  ].join("\n");
}

function renderItem(entry: PublishedFeedEntry, baseUrl: string): string {
  const articleUrl = `${baseUrl}/a/${encodeURIComponent(entry.articleAccessId)}/${encodeURIComponent(entry.slug)}`;
  const body = [
    `<p><img src="${escapeHtmlAttribute(entry.coverUrl)}" alt="Cover for ${escapeHtmlAttribute(entry.title)}"></p>`,
    `<p><strong>${escapeXml(entry.sourceName)}</strong></p>`,
    `<p>${escapeXml(entry.summary)}</p>`,
    entry.contentHtml,
    `<p><a href="${escapeHtmlAttribute(entry.originalUrl)}">Read the original article</a></p>`,
  ].join("\n");
  return [
    "<item>",
    `<title>${escapeXml(entry.title)}</title>`,
    `<link>${escapeXml(articleUrl)}</link>`,
    `<guid isPermaLink="false">${escapeXml(entry.articleId)}</guid>`,
    `<pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>`,
    `<description>${escapeXml(entry.summary)}</description>`,
    `<content:encoded><![CDATA[${escapeCdata(body)}]]></content:encoded>`,
    "</item>",
  ].join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeXml(value);
}

function escapeCdata(value: string): string {
  return value.replace(/\]\]>/gu, "]]&gt;");
}
