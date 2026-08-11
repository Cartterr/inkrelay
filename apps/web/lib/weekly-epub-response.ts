import {
  renderWeeklyEpub,
  WeeklyEpubValidationError,
  type WeeklyEpubEntry,
  type WeeklyEpubInput,
} from "@inkrelay/rendering";

export interface WeeklyEpubSourceRow {
  articleId: string;
  title: string;
  sourceName: string;
  summary: string | null;
  contentHtml: string | null;
  originalUrl: string;
  storageKey: string;
  publishedAt: Date | null;
}

interface StoredEpubAsset {
  body: Buffer;
  contentType: string;
}

export interface WeeklyEpubResponseDependencies {
  acceptFeedKey(feedKey: string): Promise<boolean>;
  loadEdition(): Promise<{ editionId: string | null; entries: WeeklyEpubSourceRow[] }>;
  loadAsset(storageKey: string): Promise<StoredEpubAsset | null>;
  render?: (input: WeeklyEpubInput) => Buffer | Promise<Buffer>;
}

export async function createWeeklyEpubResponse(
  feedKey: string,
  dependencies: WeeklyEpubResponseDependencies,
): Promise<Response> {
  if (!(await dependencies.acceptFeedKey(feedKey))) {
    return new Response("Not found", { status: 404 });
  }

  const latest = await dependencies.loadEdition();
  if (!latest.editionId) return new Response("No published edition", { status: 503 });
  if (latest.entries.length !== 10) return new Response("Edition is incomplete", { status: 503 });
  if (latest.entries.some((entry) => !entry.contentHtml?.trim())) {
    return new Response("Edition content is unavailable", { status: 503 });
  }

  const entries: WeeklyEpubEntry[] = [];
  for (const row of latest.entries) {
    const storedCover = await dependencies.loadAsset(row.storageKey);
    if (storedCover?.contentType !== "image/png") {
      return new Response("Edition cover is unavailable", { status: 503 });
    }
    entries.push({
      articleId: row.articleId,
      title: row.title,
      sourceName: row.sourceName,
      summary: row.summary ?? "A carefully selected technical article.",
      contentHtml: row.contentHtml ?? "",
      originalUrl: row.originalUrl,
      publishedAt: row.publishedAt?.toISOString() ?? new Date(0).toISOString(),
      coverPng: storedCover.body,
    });
  }

  const publishedAt = latest.entries[0]?.publishedAt?.toISOString() ?? new Date(0).toISOString();
  try {
    const epub = await (dependencies.render ?? renderWeeklyEpub)({
      editionId: latest.editionId,
      title: `InkRelay Weekly · ${latest.editionId}`,
      publishedAt,
      entries,
    });
    const safeEditionId = latest.editionId.replace(/[^A-Za-z0-9._-]/gu, "-") || "edition";
    return new Response(new Uint8Array(epub), {
      headers: {
        "content-type": "application/epub+zip",
        "content-disposition": `attachment; filename="inkrelay-weekly-${safeEditionId}.epub"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof WeeklyEpubValidationError) {
      return new Response("Edition EPUB is unavailable", { status: 503 });
    }
    throw error;
  }
}
