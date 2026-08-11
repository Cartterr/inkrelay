import { createHash } from "node:crypto";

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import sanitizeHtml from "sanitize-html";

import { canonicalizeUrl } from "./ingestion.js";

export interface ExtractedArticle {
  title: string;
  byline: string | null;
  excerpt: string | null;
  canonicalUrl: string;
  imageUrl: string | null;
  publishedAt: string | null;
  contentHtml: string;
  textContent: string;
  contentFingerprint: string;
  wordCount: number;
  readingMinutes: number;
}

const ALLOWED_TAGS = [
  "article",
  "section",
  "div",
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "figure",
  "figcaption",
  "img",
  "a",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

export function extractArticle(html: string, pageUrl: string): ExtractedArticle {
  const dom = new JSDOM(html, { url: pageUrl });
  const document = dom.window.document;
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const image =
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ||
    document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content;
  const publishedAt =
    document.querySelector<HTMLMetaElement>('meta[property="article:published_time"]')?.content ||
    document.querySelector<HTMLTimeElement>("time[datetime]")?.dateTime ||
    null;
  const parsed = new Readability(document.cloneNode(true) as Document).parse();
  if (!parsed) throw new Error("Article extraction failed");

  const textContent = normalizeWhitespace(parsed.textContent ?? "");
  const wordCount = textContent ? textContent.split(/\s+/u).length : 0;
  if (wordCount < 50) throw new Error("Article extraction produced too little useful text");

  const contentHtml = sanitizeHtml(parsed.content ?? "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName, attribs) => ({ tagName: "a", attribs: { ...attribs, rel: "noreferrer" } }),
    },
  });

  return {
    title: parsed.title?.trim() || document.title.trim() || "Untitled article",
    byline: parsed.byline?.trim() || null,
    excerpt: parsed.excerpt?.trim() || null,
    canonicalUrl: canonicalizeUrl(canonical || pageUrl),
    imageUrl: image ? new URL(image, pageUrl).toString() : null,
    publishedAt: normalizeDate(publishedAt),
    contentHtml,
    textContent,
    contentFingerprint: fingerprintContent(textContent),
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 220)),
  };
}

export function fingerprintContent(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
