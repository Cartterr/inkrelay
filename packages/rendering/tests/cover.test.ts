import sharp from "sharp";
import { describe, expect, test } from "vitest";

import { layoutCoverTitle, renderMonochromeCover } from "../src/cover.js";

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

  test("wraps and truncates editorial titles inside a fixed layout", () => {
    const lines = layoutCoverTitle(
      "An Extremely Long Technical Article Title About Real-Time Rendering Architecture and Production Constraints on Mobile Game Hardware with Extensive Deployment Notes",
    );
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.every((line) => line.length <= 24)).toBe(true);
    expect(lines.at(-1)?.endsWith("…")).toBe(true);
  });
});
