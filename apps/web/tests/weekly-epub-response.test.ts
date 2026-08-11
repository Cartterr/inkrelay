import { describe, expect, test, vi } from "vitest";

import {
  createWeeklyEpubResponse,
  type WeeklyEpubResponseDependencies,
  type WeeklyEpubSourceRow,
} from "../lib/weekly-epub-response.js";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function completeRows(count = 10): WeeklyEpubSourceRow[] {
  return Array.from({ length: count }, (_, index) => ({
    articleId: `article-${index + 1}`,
    title: `Technical article ${index + 1}`,
    sourceName: `Distinct source ${index + 1}`,
    summary: `Editorial summary ${index + 1}`,
    contentHtml: `<p>A substantive article body for item ${index + 1}.</p>`,
    originalUrl: `https://source.example/article-${index + 1}`,
    storageKey: `covers/article-${index + 1}.png`,
    publishedAt: new Date("2026-08-15T22:00:00.000Z"),
  }));
}

function dependencies(
  overrides: Partial<WeeklyEpubResponseDependencies> = {},
): WeeklyEpubResponseDependencies {
  return {
    acceptFeedKey: vi.fn().mockResolvedValue(true),
    loadEdition: vi.fn().mockResolvedValue({ editionId: "2026/W33", entries: completeRows() }),
    loadAsset: vi.fn().mockResolvedValue({ body: onePixelPng, contentType: "image/png" }),
    render: vi.fn().mockReturnValue(Buffer.from("epub bytes")),
    ...overrides,
  };
}

describe("weekly EPUB response", () => {
  test("returns a private EPUB download for an authorized complete edition", async () => {
    const response = await createWeeklyEpubResponse("accepted-key", dependencies());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/epub+zip");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="inkrelay-weekly-2026-W33.epub"',
    );
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("epub bytes");
  });

  test("does not inspect edition data when the feed key is rejected", async () => {
    const deps = dependencies({ acceptFeedKey: vi.fn().mockResolvedValue(false) });

    const response = await createWeeklyEpubResponse("rejected-key", deps);

    expect(response.status).toBe(404);
    expect(deps.loadEdition).not.toHaveBeenCalled();
    expect(deps.loadAsset).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });

  test("fails closed for an incomplete edition or unavailable content", async () => {
    const incomplete = dependencies({
      loadEdition: vi.fn().mockResolvedValue({ editionId: "2026-W33", entries: completeRows(9) }),
    });
    expect((await createWeeklyEpubResponse("accepted-key", incomplete)).status).toBe(503);
    expect(incomplete.loadAsset).not.toHaveBeenCalled();

    const missingContentRows = completeRows();
    const firstRow = missingContentRows[0];
    if (!firstRow) throw new Error("Expected a complete fixture");
    missingContentRows[0] = { ...firstRow, contentHtml: null };
    const missingContent = dependencies({
      loadEdition: vi
        .fn()
        .mockResolvedValue({ editionId: "2026-W33", entries: missingContentRows }),
    });
    expect((await createWeeklyEpubResponse("accepted-key", missingContent)).status).toBe(503);
    expect(missingContent.loadAsset).not.toHaveBeenCalled();
  });

  test("fails closed for missing assets and invalid cover dimensions", async () => {
    const missingAsset = dependencies({ loadAsset: vi.fn().mockResolvedValue(null) });
    expect((await createWeeklyEpubResponse("accepted-key", missingAsset)).status).toBe(503);

    const invalidCover = dependencies({ render: undefined });
    const response = await createWeeklyEpubResponse("accepted-key", invalidCover);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Edition EPUB is unavailable");
  });
});
