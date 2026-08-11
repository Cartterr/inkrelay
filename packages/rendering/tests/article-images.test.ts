import sharp from "sharp";
import { describe, expect, test, vi } from "vitest";

import { prepareArticleImages, selectArticleImageUrl } from "../src/article-images.js";

async function sourceImage(width = 900, height = 600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 120, b: 220 } },
  })
    .png()
    .toBuffer();
}

describe("article image preparation", () => {
  test("downloads, deduplicates, and converts editorial images for offline Kindle use", async () => {
    const image = await sourceImage();
    const fetchImage = vi.fn().mockResolvedValue({ bytes: image, contentType: "image/png" });
    const prepared = await prepareArticleImages(
      `<figure><img src="/diagram.png" srcset="/diagram-small.png 400w, /diagram.png 1200w" alt="Architecture diagram"><figcaption>System layout</figcaption></figure><img src="/diagram.png" alt="duplicate">`,
      "https://example.com/posts/rendering",
      { fetchImage },
    );

    expect(fetchImage).toHaveBeenCalledOnce();
    expect(fetchImage).toHaveBeenCalledWith("https://example.com/diagram.png");
    expect(prepared).toMatchObject({ discoveredCount: 1, failedCount: 0, skippedCount: 0 });
    expect(prepared.images).toHaveLength(1);
    expect(prepared.images[0]).toMatchObject({
      sourceUrl: "https://example.com/diagram.png",
      mediaType: "image/jpeg",
      alt: "Architecture diagram",
    });
    expect(await sharp(prepared.images[0]?.bytes).metadata()).toMatchObject({
      format: "jpeg",
      space: "b-w",
    });
  });

  test("continues past bad, vector, and tiny images", async () => {
    const large = await sourceImage();
    const fetchImage = vi.fn(async (url: string) => {
      if (url.endsWith("bad.png")) throw new Error("network failed");
      if (url.endsWith("vector.svg")) {
        return { bytes: Buffer.from("<svg/>"), contentType: "image/svg+xml" };
      }
      return { bytes: large, contentType: "image/png" };
    });
    const prepared = await prepareArticleImages(
      `<img src="/pixel.png" width="1" height="1"><img src="/bad.png"><img src="/vector.svg"><img src="/good.png">`,
      "https://example.com/article",
      { fetchImage },
    );

    expect(prepared.images).toHaveLength(1);
    expect(prepared.images[0]?.sourceUrl).toBe("https://example.com/good.png");
    expect(prepared.failedCount).toBe(2);
  });

  test("selects the largest srcset candidate and rejects unsafe URL schemes", () => {
    expect(
      selectArticleImageUrl(
        { src: "/fallback.jpg", srcset: "/small.jpg 400w, /large.jpg 1200w" },
        "https://example.com/post",
      ),
    ).toBe("https://example.com/large.jpg");
    expect(
      selectArticleImageUrl({ src: "data:image/png;base64,AA==" }, "https://example.com"),
    ).toBeNull();
  });
});
