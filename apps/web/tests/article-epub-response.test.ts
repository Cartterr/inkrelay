import { describe, expect, test, vi } from "vitest";

import {
  createArticleEpubResponse,
  type ArticleEpubResponseDependencies,
} from "../lib/article-epub-response.js";
import type { WeeklyEpubSourceRow } from "../lib/weekly-epub-response.js";

const coverPng = Buffer.from("cover");

function rows(): WeeklyEpubSourceRow[] {
  return Array.from({ length: 10 }, (_, index) => ({
    articleId: `article-${index + 1}`,
    title: `Article ${index + 1}`,
    sourceName: `Source ${index + 1}`,
    summary: `Summary ${index + 1}`,
    contentHtml: `<p>Body ${index + 1}</p><img src="https://example.com/${index + 1}.png">`,
    originalUrl: `https://example.com/articles/${index + 1}`,
    storageKey: `covers/${index + 1}.png`,
    publishedAt: new Date("2026-08-11T12:00:00.000Z"),
  }));
}

function dependencies(
  overrides: Partial<ArticleEpubResponseDependencies> = {},
): ArticleEpubResponseDependencies {
  return {
    acceptFeedKey: vi.fn().mockResolvedValue(true),
    loadEdition: vi.fn().mockResolvedValue({ editionId: "2026/W33", entries: rows() }),
    loadAsset: vi.fn().mockResolvedValue({ body: coverPng, contentType: "image/png" }),
    prepareImages: vi.fn().mockResolvedValue({ images: [] }),
    render: vi.fn().mockReturnValue(Buffer.from("standalone epub")),
    ...overrides,
  };
}

describe("article EPUB response", () => {
  test("returns the selected article as a private standalone EPUB", async () => {
    const deps = dependencies();
    const response = await createArticleEpubResponse("accepted", 3, deps);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="inkrelay-2026-W33-03.epub"',
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("standalone epub");
    expect(deps.prepareImages).toHaveBeenCalledWith(
      '<p>Body 3</p><img src="https://example.com/3.png">',
      "https://example.com/articles/3",
    );
    expect(deps.render).toHaveBeenCalledWith(
      expect.objectContaining({ entry: expect.objectContaining({ articleId: "article-3" }) }),
    );
  });

  test("rejects invalid ranks and feed keys before rendering", async () => {
    const invalidRank = dependencies();
    expect((await createArticleEpubResponse("accepted", 0, invalidRank)).status).toBe(404);
    expect(invalidRank.loadEdition).not.toHaveBeenCalled();

    const rejected = dependencies({ acceptFeedKey: vi.fn().mockResolvedValue(false) });
    expect((await createArticleEpubResponse("rejected", 1, rejected)).status).toBe(404);
    expect(rejected.loadEdition).not.toHaveBeenCalled();
  });

  test("fails closed when edition content or covers are unavailable", async () => {
    const incomplete = dependencies({
      loadEdition: vi
        .fn()
        .mockResolvedValue({ editionId: "2026-W33", entries: rows().slice(0, 9) }),
    });
    expect((await createArticleEpubResponse("accepted", 1, incomplete)).status).toBe(503);

    const missingCover = dependencies({ loadAsset: vi.fn().mockResolvedValue(null) });
    expect((await createArticleEpubResponse("accepted", 1, missingCover)).status).toBe(503);
    expect(missingCover.prepareImages).not.toHaveBeenCalled();
  });
});
