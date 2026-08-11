import { isFeedKeyAccepted, latestWeeklyEntries } from "@inkrelay/db";
import { renderWeeklyEpub, type WeeklyEpubEntry } from "@inkrelay/rendering";

import { assetStore, database, runtimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ feedKey: string }> }) {
  const { feedKey } = await context.params;
  const config = runtimeConfig();
  const connection = database();
  if (!(await isFeedKeyAccepted(connection, feedKey, config.feedAccessKey))) {
    return new Response("Not found", { status: 404 });
  }

  const latest = await latestWeeklyEntries(connection);
  if (!latest.editionId) return new Response("No published edition", { status: 503 });
  if (latest.entries.length !== 10) return new Response("Edition is incomplete", { status: 503 });

  const store = assetStore();
  const entries: WeeklyEpubEntry[] = [];
  for (const row of latest.entries) {
    if (!row.textContent?.trim()) {
      return new Response("Edition text is unavailable", { status: 503 });
    }
    const storedCover = await store.get(row.storageKey);
    if (storedCover?.contentType !== "image/png") {
      return new Response("Edition cover is unavailable", { status: 503 });
    }
    entries.push({
      articleId: row.articleId,
      title: row.title,
      sourceName: row.sourceName,
      summary: row.summary ?? "A carefully selected technical article.",
      textContent: row.textContent,
      originalUrl: row.originalUrl,
      publishedAt: row.publishedAt?.toISOString() ?? new Date(0).toISOString(),
      coverPng: storedCover.body,
    });
  }

  const publishedAt = latest.entries[0]?.publishedAt?.toISOString() ?? new Date().toISOString();
  const epub = renderWeeklyEpub({
    editionId: latest.editionId,
    title: `InkRelay Weekly · ${latest.editionId}`,
    publishedAt,
    entries,
  });
  const safeEditionId = latest.editionId.replace(/[^A-Za-z0-9._-]/gu, "-");
  return new Response(new Uint8Array(epub), {
    headers: {
      "content-type": "application/epub+zip",
      "content-disposition": `attachment; filename="inkrelay-weekly-${safeEditionId}.epub"`,
      "cache-control": "private, no-store",
    },
  });
}
