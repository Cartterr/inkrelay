import { unzipSync } from "fflate";
import { describe, expect, test } from "vitest";

import { renderWeeklyEpub, type WeeklyEpubEntry } from "../src/epub.js";

const coverPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function makeEntries(count = 10): WeeklyEpubEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    articleId: `article-${index + 1}`,
    title: `Technical article ${index + 1}`,
    sourceName: `Distinct source ${index + 1}`,
    summary: `A detailed editorial summary for article ${index + 1}.`,
    textContent: `Opening paragraph for article ${index + 1}.\n\nSecond substantive paragraph.`,
    originalUrl: `https://source.example/articles/${index + 1}`,
    publishedAt: "2026-08-09T12:00:00.000Z",
    coverPng,
  }));
}

describe("weekly EPUB", () => {
  test("embeds a declared Kindle cover and exactly ten covered articles", () => {
    const epub = renderWeeklyEpub({
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
    expect(opf).toContain('id="cover-image" href="images/cover.png"');
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('<itemref idref="cover-page"/>');
    expect(Buffer.from(files["OEBPS/images/cover.png"] ?? [])).toEqual(coverPng);
    expect(text("OEBPS/cover.xhtml")).toContain('src="images/cover.png"');
    expect(text("OEBPS/article-01.xhtml")).toContain('src="images/article-01-cover.png"');
    expect(text("OEBPS/article-01.xhtml")).toContain("Opening paragraph for article 1.");
    expect(text("OEBPS/nav.xhtml")).toContain("Technical article 10");
    expect(
      Object.keys(files).filter((path) => /OEBPS\/article-\d{2}\.xhtml/u.test(path)),
    ).toHaveLength(10);
  });

  test("fails closed unless ten distinct sources have cover images", () => {
    expect(() =>
      renderWeeklyEpub({
        editionId: "incomplete",
        title: "Incomplete",
        publishedAt: "2026-08-15T22:00:00.000Z",
        entries: makeEntries(9),
      }),
    ).toThrow("exactly 10 entries");

    const duplicates = makeEntries();
    duplicates[9] = { ...duplicates[9], sourceName: duplicates[0]?.sourceName ?? "" };
    expect(() =>
      renderWeeklyEpub({
        editionId: "duplicate",
        title: "Duplicate",
        publishedAt: "2026-08-15T22:00:00.000Z",
        entries: duplicates,
      }),
    ).toThrow("10 distinct sources");

    const missingText = makeEntries();
    missingText[0] = { ...missingText[0], textContent: "" };
    expect(() =>
      renderWeeklyEpub({
        editionId: "missing-text",
        title: "Missing text",
        publishedAt: "2026-08-15T22:00:00.000Z",
        entries: missingText,
      }),
    ).toThrow("requires article text");
  });
});
