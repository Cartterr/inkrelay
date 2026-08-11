import sharp from "sharp";
import { describe, expect, test } from "vitest";

import { COVER_RENDERER_VERSION, layoutCoverTitle, renderMonochromeCover } from "../src/cover.js";

describe("monochrome covers", () => {
  test("renders a Kindle-friendly 1200 by 1600 grayscale PNG", async () => {
    const cover = await renderMonochromeCover({
      title: "How Modern Neural Rendering Pipelines Actually Work",
      sourceName: "ACM SIGGRAPH Blog",
      category: "graphics",
      editionLabel: "INKRELAY / WEEK 33",
    });
    const metadata = await sharp(cover).metadata();

    expect(metadata.width).toBe(1_200);
    expect(metadata.height).toBe(1_600);
    expect(metadata.format).toBe("png");
    expect(metadata.space).toBe("b-w");
  });

  test("uses a deterministic category fallback", async () => {
    const input = {
      title: "A Deterministic GPU Architecture Deep Dive",
      sourceName: "Chips and Cheese",
      category: "hardware" as const,
      editionLabel: "INKRELAY / WEEK 33",
    };
    const first = await renderMonochromeCover(input);
    const second = await renderMonochromeCover(input);
    expect(first.equals(second)).toBe(true);
  });

  test("uses an opaque high-contrast Kindle panel and the bundled-font renderer", async () => {
    const sourceImage = await sharp({
      create: {
        width: 1_200,
        height: 1_600,
        channels: 3,
        background: "#c8c8c8",
      },
    })
      .png()
      .toBuffer();
    const cover = await renderMonochromeCover({
      title: "Readable typography without missing glyph boxes",
      sourceName: "InkRelay Test Source",
      category: "software",
      editionLabel: "INKRELAY / KINDLE TEST",
      sourceImage,
    });
    const panel = await sharp(cover)
      .extract({ left: 1_100, top: 900, width: 50, height: 50 })
      .raw()
      .toBuffer();
    const average = panel.reduce((sum, value) => sum + value, 0) / panel.length;

    expect(COVER_RENDERER_VERSION).toBe("kindle-v2");
    expect(average).toBeLessThan(20);
  });

  test("wraps and truncates editorial titles inside a fixed layout", () => {
    const lines = layoutCoverTitle(
      "An Extremely Long Technical Article Title About Real-Time Rendering Architecture and Production Constraints on Mobile Game Hardware with Extensive Deployment Notes",
    );
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.every((line) => line.length <= 24)).toBe(true);
    expect(lines.at(-1)?.endsWith("...")).toBe(true);
  });

  test("normalizes generated cover typography to Kindle-safe ASCII", () => {
    const lines = layoutCoverTitle("Résumé — GPUs… and smart “quotes”");
    expect(lines.join(" ")).toBe('Resume - GPUs... and smart "quotes"');
    expect(lines.join(" ")).not.toMatch(/[^\x20-\x7E]/u);
  });

  test("fits long production headlines inside the cover canvas", async () => {
    await expect(
      renderMonochromeCover({
        title: "The Teapot Test, Reimagined: From Showing to Making With Tripo AI",
        sourceName: "ACM SIGGRAPH Blog",
        category: "graphics",
        editionLabel: "INKRELAY / TECHNICAL EDITION",
      }),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
