import {
  DeterministicAiProvider,
  extractArticle,
  parseFeedXml,
  renderSourceFeed,
} from "@inkrelay/core";
import { renderMonochromeCover } from "@inkrelay/rendering";
import sharp from "sharp";
import { describe, expect, test } from "vitest";

describe("ingestion-to-publication pipeline", () => {
  test("produces a complete covered article payload without external AI", async () => {
    const feed = await parseFeedXml(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>Graphics</title><item><guid>feature-1</guid><title>Rendering Systems</title><link>https://example.com/rendering</link></item></channel></rss>`,
      "acm-siggraph",
    );
    const paragraphs = Array.from(
      { length: 48 },
      (_, index) =>
        `<p>Rendering architecture section ${index} explains implementation details, algorithms, production constraints, diagrams, measured benchmark results, tradeoffs, failure modes, deployment lessons, and reproducible engineering conclusions.</p>`,
    ).join("");
    const article = extractArticle(
      `<html><head><title>Rendering Systems</title></head><body><article>${paragraphs}</article></body></html>`,
      feed[0]?.url ?? "https://example.com/rendering",
    );
    const provider = new DeterministicAiProvider();
    const evaluation = await provider.evaluate({
      title: article.title,
      excerpt: article.excerpt,
      wordCount: article.wordCount,
      imageCount: 3,
      publishedAt: new Date().toISOString(),
    });
    const cover = await renderMonochromeCover({
      title: article.title,
      sourceName: "ACM SIGGRAPH Blog",
      category: "graphics",
      editionLabel: "INKRELAY / TEST",
    });
    const metadata = await sharp(cover).metadata();
    const xml = renderSourceFeed({
      title: "ACM SIGGRAPH — InkRelay",
      description: "Selected graphics reading",
      publicBaseUrl: "https://inkrelay.example",
      feedPath: "/f/test/source/acm-siggraph.xml",
      entries: [
        {
          articleId: "article-1",
          articleAccessId: "opaque-article",
          slug: "rendering-systems",
          sourceId: "acm-siggraph",
          sourceName: "ACM SIGGRAPH Blog",
          title: article.title,
          summary: await provider.summarize(article),
          contentHtml: article.contentHtml,
          originalUrl: article.canonicalUrl,
          coverUrl: "https://inkrelay.example/assets/opaque-cover",
          publishedAt: new Date().toISOString(),
        },
      ],
    });

    expect(evaluation.total).toBeGreaterThan(60);
    expect(metadata).toMatchObject({ width: 1_200, height: 1_600, space: "b-w" });
    expect(xml).toContain("opaque-cover");
    expect(xml).toContain("implementation details");
  });
});
