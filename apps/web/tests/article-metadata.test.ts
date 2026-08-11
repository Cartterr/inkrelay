import { describe, expect, test } from "vitest";

const article = {
  articleAccessId: "opaque-article",
  stableSlug: "article-record",
  assetAccessId: "opaque-cover",
  title: "Rendering the next generation of digital humans",
  description: "A technical review of production rendering and character pipelines.",
  sourceName: "ACM SIGGRAPH Blog",
  publishedAt: "2026-08-09T12:00:00.000Z",
};

async function metadataModule() {
  return import("../lib/article-metadata").catch(() => ({
    buildArticleMetadata: undefined,
    buildArticleStructuredData: undefined,
  }));
}

describe("article discovery metadata", () => {
  test("identifies the public article and cover to server-side readers", async () => {
    const module = await metadataModule();

    expect(module.buildArticleMetadata?.(article, "https://reader.example")).toEqual({
      title: "Rendering the next generation of digital humans",
      description: "A technical review of production rendering and character pipelines.",
      alternates: {
        canonical: "https://reader.example/a/opaque-article/article-record",
      },
      robots: { index: true, follow: true },
      openGraph: {
        type: "article",
        title: "Rendering the next generation of digital humans",
        description: "A technical review of production rendering and character pipelines.",
        url: "https://reader.example/a/opaque-article/article-record",
        siteName: "InkRelay",
        publishedTime: "2026-08-09T12:00:00.000Z",
        authors: ["ACM SIGGRAPH Blog"],
        images: [
          {
            url: "https://reader.example/assets/opaque-cover",
            width: 1200,
            height: 1600,
            alt: "Editorial cover for Rendering the next generation of digital humans",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: "Rendering the next generation of digital humans",
        description: "A technical review of production rendering and character pipelines.",
        images: ["https://reader.example/assets/opaque-cover"],
      },
    });
  });

  test("publishes standards-based Article structured data", async () => {
    const module = await metadataModule();

    expect(module.buildArticleStructuredData?.(article, "https://reader.example")).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Rendering the next generation of digital humans",
      description: "A technical review of production rendering and character pipelines.",
      datePublished: "2026-08-09T12:00:00.000Z",
      mainEntityOfPage: "https://reader.example/a/opaque-article/article-record",
      image: ["https://reader.example/assets/opaque-cover"],
      author: { "@type": "Organization", name: "ACM SIGGRAPH Blog" },
      publisher: { "@type": "Organization", name: "InkRelay" },
    });
  });
});
