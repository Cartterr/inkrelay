import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";

import { publishedArticleByAccessId } from "@inkrelay/db";

import {
  buildArticleMetadata,
  buildArticleStructuredData,
  type ArticleDiscoveryInput,
} from "@/lib/article-metadata";
import { database, runtimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const getPublishedArticle = cache((articleAccessId: string) =>
  publishedArticleByAccessId(database(), articleAccessId),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ articleAccessId: string; slug: string }>;
}): Promise<Metadata> {
  const { articleAccessId } = await params;
  const record = await getPublishedArticle(articleAccessId);
  if (!record) return {};
  return buildArticleMetadata(discoveryInput(record), runtimeConfig().publicBaseUrl);
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ articleAccessId: string; slug: string }>;
}) {
  const { articleAccessId } = await params;
  const record = await getPublishedArticle(articleAccessId);
  if (!record?.article.contentHtml) notFound();
  const published = record.article.publishedAt ?? record.article.createdAt;
  const structuredData = buildArticleStructuredData(
    discoveryInput(record),
    runtimeConfig().publicBaseUrl,
  );

  return (
    <main className="reader-shell">
      <article className="reader-article">
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is serialized from trusted database fields and escapes tag delimiters.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</gu, "\\u003c"),
          }}
        />
        {/* The opaque asset ID is independent from the article and feed access identifiers. */}
        <Image
          className="reader-cover"
          src={`/assets/${encodeURIComponent(record.cover.assetAccessId)}`}
          alt={`Editorial cover for ${record.article.title}`}
          width={1200}
          height={1600}
          priority
          unoptimized
        />
        <header className="reader-header">
          <p className="eyebrow">{record.source.name}</p>
          <h1>{record.article.title}</h1>
          <div className="reader-meta">
            <span>{published.toLocaleDateString("en-US", { dateStyle: "long" })}</span>
            <span>{record.article.readingMinutes} min read</span>
          </div>
          {record.article.summary ? (
            <p className="reader-summary">{record.article.summary}</p>
          ) : null}
        </header>
        <div
          className="reader-body"
          // This HTML passed Mozilla Readability and InkRelay's strict sanitize-html allowlist.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendering the already-sanitized article body is the purpose of this route.
          dangerouslySetInnerHTML={{ __html: record.article.contentHtml }}
        />
        <footer className="reader-attribution">
          Originally published by {record.source.name}.{" "}
          <a href={record.article.canonicalUrl} rel="noreferrer">
            Open the original article
          </a>
          .
        </footer>
      </article>
    </main>
  );
}

function discoveryInput(
  record: NonNullable<Awaited<ReturnType<typeof publishedArticleByAccessId>>>,
): ArticleDiscoveryInput {
  const published = record.article.publishedAt ?? record.article.createdAt;
  return {
    articleAccessId: record.article.articleAccessId,
    stableSlug: record.article.id,
    assetAccessId: record.cover.assetAccessId,
    title: record.article.title,
    description:
      record.article.summary ??
      record.article.excerpt ??
      `A curated technical article from ${record.source.name}.`,
    sourceName: record.source.name,
    publishedAt: published.toISOString(),
  };
}
