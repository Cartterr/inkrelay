import type { Metadata } from "next";

export interface ArticleDiscoveryInput {
  articleAccessId: string;
  stableSlug: string;
  assetAccessId: string;
  title: string;
  description: string;
  sourceName: string;
  publishedAt: string;
}

export function buildArticleMetadata(
  article: ArticleDiscoveryInput,
  publicBaseUrl: string,
): Metadata {
  const articleUrl = publicUrl(
    publicBaseUrl,
    `/a/${encodeURIComponent(article.articleAccessId)}/${encodeURIComponent(article.stableSlug)}`,
  );
  const coverUrl = publicUrl(publicBaseUrl, `/assets/${encodeURIComponent(article.assetAccessId)}`);
  const coverAlt = `Editorial cover for ${article.title}`;

  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: articleUrl },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      url: articleUrl,
      siteName: "InkRelay",
      publishedTime: article.publishedAt,
      authors: [article.sourceName],
      images: [{ url: coverUrl, width: 1200, height: 1600, alt: coverAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images: [coverUrl],
    },
  };
}

export function buildArticleStructuredData(article: ArticleDiscoveryInput, publicBaseUrl: string) {
  const articleUrl = publicUrl(
    publicBaseUrl,
    `/a/${encodeURIComponent(article.articleAccessId)}/${encodeURIComponent(article.stableSlug)}`,
  );
  const coverUrl = publicUrl(publicBaseUrl, `/assets/${encodeURIComponent(article.assetAccessId)}`);

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    mainEntityOfPage: articleUrl,
    image: [coverUrl],
    author: { "@type": "Organization", name: article.sourceName },
    publisher: { "@type": "Organization", name: "InkRelay" },
  };
}

function publicUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${baseUrl.replace(/\/$/u, "")}/`).toString();
}
