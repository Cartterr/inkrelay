import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { publishedArticleByAccessId } from "@inkrelay/db";

import {
  buildArticleMetadata,
  buildArticleStructuredData,
  publicInlineAssetUrl,
  type ArticleDiscoveryInput,
} from "@/lib/article-metadata";
import { buildArticleRequestLog } from "@/lib/article-request-log";
import { database, runtimeConfig } from "@/lib/runtime";
import { ExtractableArticleBody } from "@/components/extractable-article-body";

export const dynamic = "force-dynamic";

const getPublishedArticle = cache(async (articleAccessId: string) => {
  const requestHeaders = await headers();
  console.info(
    JSON.stringify(buildArticleRequestLog(articleAccessId, requestHeaders.get("user-agent"))),
  );
  return publishedArticleByAccessId(database(), articleAccessId);
});

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
  const publicBaseUrl = runtimeConfig().publicBaseUrl;
  const structuredData = buildArticleStructuredData(discoveryInput(record), publicBaseUrl);
  const coverUrl = publicInlineAssetUrl(record.cover.assetAccessId, publicBaseUrl);

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
        <ExtractableArticleBody
          articleHtml={record.article.contentHtml}
          coverUrl={coverUrl}
          title={record.article.title}
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
