import type { PublishedFeedEntry } from "@inkrelay/core";

export function toPublishedFeedEntries(
  rows: Array<{
    articleId: string;
    articleAccessId: string;
    sourceId: string;
    sourceName: string;
    title: string;
    summary: string | null;
    contentHtml: string | null;
    originalUrl: string;
    assetAccessId: string;
    publishedAt: Date | null;
  }>,
  publicBaseUrl: string,
): PublishedFeedEntry[] {
  return rows.flatMap((row) => {
    if (!row.summary || !row.contentHtml || !row.publishedAt) return [];
    return [
      {
        articleId: row.articleId,
        articleAccessId: row.articleAccessId,
        slug: slugify(row.title),
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        title: row.title,
        summary: row.summary,
        contentHtml: row.contentHtml,
        originalUrl: row.originalUrl,
        coverUrl: `${publicBaseUrl}/assets/${encodeURIComponent(row.assetAccessId)}`,
        publishedAt: row.publishedAt.toISOString(),
      },
    ];
  });
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLocaleLowerCase("en-US")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 90) || "article"
  );
}

export function normalizeSourceSlug(value: string): string {
  return value.endsWith(".xml") ? value.slice(0, -4) : value;
}
