import { unzipSync } from "fflate";
import { beforeAll, describe, expect, test } from "vitest";

import { renderMonochromeCover } from "../src/cover.js";
import { renderWeeklyEpub, type WeeklyEpubEntry } from "../src/epub.js";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
let coverPng: Buffer;

beforeAll(async () => {
  coverPng = await renderMonochromeCover({
    title: "A Production-Grade Rendering Architecture",
    sourceName: "ACM SIGGRAPH Blog",
    category: "graphics",
    editionLabel: "INKRELAY / WEEK 33",
  });
});

function makeEntries(count = 10): WeeklyEpubEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    articleId: `article-${index + 1}`,
    title: `Technical article ${index + 1}`,
    sourceName: `Distinct source ${index + 1}`,
    summary: `A detailed editorial summary for article ${index + 1}.`,
    contentHtml: `<p onclick="steal()">Opening paragraph for article ${index + 1}.</p><h2>Architecture</h2><p>Second substantive paragraph.</p><script>alert(1)</script><a href="javascript:alert(2)">unsafe link</a>`,
    originalUrl: `https://source.example/articles/${index + 1}`,
    publishedAt: "2026-08-09T12:00:00.000Z",
    coverPng,
  }));
}

describe("weekly EPUB", () => {
  test("embeds a declared Kindle cover and exactly ten covered articles", async () => {
    const epub = await renderWeeklyEpub({
      editionId: "2026-W33",
      title: "InkRelay Weekly · 2026-W33",
      publishedAt: "2026-08-15T22:00:00.000Z",
      entries: makeEntries(),
    });

    expect(epub.readUInt32LE(0)).toBe(0x04034b50);
    expect(epub.readUInt16LE(8)).toBe(0);
    const firstNameLength = epub.readUInt16LE(26);
    const firstName = epub.subarray(30, 30 + firstNameLength).toString("utf8");
    expect(firstName).toBe("mimetype");

    const files = unzipSync(epub);
    const text = (path: string) => new TextDecoder().decode(files[path]);
    const opf = text("OEBPS/content.opf");

    expect(text("mimetype")).toBe("application/epub+zip");
    expect(opf).toContain('<meta name="cover" content="cover-image"/>');
    expect(opf).toContain('id="cover-image" href="images/article-01-cover.png"');
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('<itemref idref="cover-page"/>');
    expect(files["OEBPS/images/cover.png"]).toBeUndefined();
    expect(Buffer.from(files["OEBPS/images/article-01-cover.png"] ?? [])).toEqual(coverPng);
    expect(text("OEBPS/cover.xhtml")).toContain('src="images/article-01-cover.png"');
    expect(text("OEBPS/article-01.xhtml")).toContain('src="images/article-01-cover.png"');
    expect(text("OEBPS/article-01.xhtml")).toContain("Opening paragraph for article 1.");
    expect(text("OEBPS/article-01.xhtml")).toContain("<h2>Architecture</h2>");
    expect(text("OEBPS/article-01.xhtml")).toContain("Second substantive paragraph.");
    expect(text("OEBPS/article-01.xhtml")).not.toContain("onclick");
    expect(text("OEBPS/article-01.xhtml")).not.toContain("<script");
    expect(text("OEBPS/article-01.xhtml")).not.toContain("javascript:");
    expect(text("OEBPS/nav.xhtml")).toContain("Technical article 10");
    expect(
      Object.keys(files).filter((path) => /OEBPS\/article-\d{2}\.xhtml/u.test(path)),
    ).toHaveLength(10);
    expect(
      Object.keys(files).filter((path) => /OEBPS\/images\/article-\d{2}-cover\.png/u.test(path)),
    ).toHaveLength(10);
  });

  test("fails closed unless ten distinct sources have valid cover images", async () => {
    await expect(
      renderWeeklyEpub({
        editionId: "incomplete",
        title: "Incomplete",
        publishedAt: "2026-08-15T22:00:00.000Z",
        entries: makeEntries(9),
      }),
    ).rejects.toThrow("exactly 10 entries");

    const duplicates = makeEntries();
    duplicates[9] = { ...duplicates[9], sourceName: duplicates[0]?.sourceName ?? "" };
    await expect(
      renderWeeklyEpub({
        editionId: "duplicate",
        title: "Duplicate",
        publishedAt: "2026-08-15T22:00:00.000Z",
        entries: duplicates,
      }),
    ).rejects.toThrow("10 distinct sources");

    const missingContent = makeEntries();
    missingContent[0] = { ...missingContent[0], contentHtml: "" };
    await expect(
      renderWeeklyEpub({
        editionId: "missing-content",
        title: "Missing content",
        publishedAt: "2026-08-15T22:00:00.000Z",
        entries: missingContent,
      }),
    ).rejects.toThrow("requires article content");

    const invalidCover = makeEntries();
    invalidCover[0] = { ...invalidCover[0], coverPng: onePixelPng };
    await expect(
      renderWeeklyEpub({
        editionId: "invalid-cover",
        title: "Invalid cover",
        publishedAt: "2026-08-15T22:00:00.000Z",
        entries: invalidCover,
      }),
    ).rejects.toThrow("1200 by 1600 PNG");

    const forgedHeader = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(forgedHeader);
    forgedHeader.write("IHDR", 12, "ascii");
    forgedHeader.writeUInt32BE(1_200, 16);
    forgedHeader.writeUInt32BE(1_600, 20);
    const corruptCover = makeEntries();
    corruptCover[0] = { ...corruptCover[0], coverPng: forgedHeader };
    await expect(
      renderWeeklyEpub({
        editionId: "corrupt-cover",
        title: "Corrupt cover",
        publishedAt: "2026-08-15T22:00:00.000Z",
        entries: corruptCover,
      }),
    ).rejects.toThrow("valid 1200 by 1600 PNG");
  });
});
