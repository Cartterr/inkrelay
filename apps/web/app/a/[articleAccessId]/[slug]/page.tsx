import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { publishedArticleByAccessId } from "@inkrelay/db";

import { database } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: true, follow: true } };

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ articleAccessId: string; slug: string }>;
}) {
  const { articleAccessId } = await params;
  const record = await publishedArticleByAccessId(database(), articleAccessId);
  if (!record?.article.contentHtml) notFound();
  const published = record.article.publishedAt ?? record.article.createdAt;

  return (
    <main className="reader-shell">
      <article className="reader-article">
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
