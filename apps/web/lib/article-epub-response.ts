import {
  prepareArticleImages,
  renderArticleEpub,
  WeeklyEpubValidationError,
  type ArticleEpubInput,
  type EmbeddedArticleImage,
} from "@inkrelay/rendering";

import type { WeeklyEpubSourceRow } from "./weekly-epub-response.js";

interface StoredEpubAsset {
  body: Buffer;
  contentType: string;
}

interface PreparedImages {
  images: EmbeddedArticleImage[];
}

export interface ArticleEpubResponseDependencies {
  acceptFeedKey(feedKey: string): Promise<boolean>;
  loadEdition(): Promise<{ editionId: string | null; entries: WeeklyEpubSourceRow[] }>;
  loadAsset(storageKey: string): Promise<StoredEpubAsset | null>;
  prepareImages?: (contentHtml: string, baseUrl: string) => Promise<PreparedImages>;
  render?: (input: ArticleEpubInput) => Buffer | Promise<Buffer>;
}

export async function createArticleEpubResponse(
  feedKey: string,
  rank: number,
  dependencies: ArticleEpubResponseDependencies,
): Promise<Response> {
  if (!(await dependencies.acceptFeedKey(feedKey))) {
    return new Response("Not found", { status: 404 });
  }
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
    return new Response("Not found", { status: 404 });
  }

  const latest = await dependencies.loadEdition();
  if (!latest.editionId || latest.entries.length !== 10) {
    return new Response("Edition is unavailable", { status: 503 });
  }
  const row = latest.entries[rank - 1];
  if (!row?.contentHtml?.trim()) return new Response("Article is unavailable", { status: 503 });
  const storedCover = await dependencies.loadAsset(row.storageKey);
  if (storedCover?.contentType !== "image/png") {
    return new Response("Article cover is unavailable", { status: 503 });
  }

  try {
    const prepared = await (dependencies.prepareImages ?? prepareArticleImages)(
      row.contentHtml,
      row.originalUrl,
    );
    const epub = await (dependencies.render ?? renderArticleEpub)({
      editionId: latest.editionId,
      entry: {
        articleId: row.articleId,
        title: row.title,
        sourceName: row.sourceName,
        summary: row.summary ?? "A carefully selected technical article.",
        contentHtml: row.contentHtml,
        originalUrl: row.originalUrl,
        publishedAt: row.publishedAt?.toISOString() ?? new Date(0).toISOString(),
        coverPng: storedCover.body,
        inlineImages: prepared.images,
      },
    });
    const safeEditionId = latest.editionId.replace(/[^A-Za-z0-9._-]/gu, "-") || "edition";
    const safeRank = String(rank).padStart(2, "0");
    return new Response(new Uint8Array(epub), {
      headers: {
        "content-type": "application/epub+zip",
        "content-disposition": `attachment; filename="inkrelay-${safeEditionId}-${safeRank}.epub"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof WeeklyEpubValidationError) {
      return new Response("Article EPUB is unavailable", { status: 503 });
    }
    throw error;
  }
}
