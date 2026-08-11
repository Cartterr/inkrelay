import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ArticleEvaluation, SourceCategory } from "@inkrelay/core";

export const ingestionKind = pgEnum("ingestion_kind", ["feed", "autodiscover", "hacker-news"]);
export const extractionStatus = pgEnum("extraction_status", [
  "pending",
  "complete",
  "failed",
  "paywalled",
]);
export const editionStatus = pgEnum("edition_status", [
  "draft",
  "publishing",
  "published",
  "failed",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "sending",
  "delivered",
  "failed",
]);
export const overrideMode = pgEnum("override_mode", ["none", "promote", "suppress", "lock"]);

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").$type<SourceCategory>().notNull(),
    ingestionKind: ingestionKind("ingestion_kind").notNull(),
    configuredUrl: text("configured_url").notNull(),
    pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(60),
    enabled: boolean("enabled").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("sources_slug_unique").on(table.slug)],
);

export const feedCursors = pgTable("feed_cursors", {
  sourceId: text("source_id")
    .primaryKey()
    .references(() => sources.id, { onDelete: "cascade" }),
  resolvedFeedUrl: text("resolved_feed_url"),
  etag: text("etag"),
  lastModified: text("last_modified"),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  nextPollAt: timestamp("next_poll_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  updatedAt,
});

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleAccessId: text("article_access_id").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    canonicalUrl: text("canonical_url").notNull(),
    contentFingerprint: text("content_fingerprint").notNull(),
    title: text("title").notNull(),
    byline: text("byline"),
    excerpt: text("excerpt"),
    summary: text("summary"),
    contentHtml: text("content_html"),
    textContent: text("text_content"),
    imageUrl: text("image_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    extractionStatus: extractionStatus("extraction_status").notNull().default("pending"),
    extractionDiagnostics: jsonb("extraction_diagnostics")
      .$type<{ code?: string; warnings?: string[] }>()
      .notNull()
      .default({}),
    wordCount: integer("word_count").notNull().default(0),
    readingMinutes: integer("reading_minutes").notNull().default(0),
    bodyExpiresAt: timestamp("body_expires_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("articles_access_id_unique").on(table.articleAccessId),
    uniqueIndex("articles_source_url_unique").on(table.sourceId, table.canonicalUrl),
    index("articles_fingerprint_idx").on(table.contentFingerprint),
    index("articles_published_at_idx").on(table.publishedAt),
  ],
);

export const evaluations = pgTable("evaluations", {
  articleId: uuid("article_id")
    .primaryKey()
    .references(() => articles.id, { onDelete: "cascade" }),
  depth: integer("depth").notNull(),
  originality: integer("originality").notNull(),
  relevance: integer("relevance").notNull(),
  readability: integer("readability").notNull(),
  visualValue: integer("visual_value").notNull(),
  recency: integer("recency").notNull(),
  penalties: jsonb("penalties").$type<ArticleEvaluation["penalties"]>().notNull().default([]),
  total: integer("total").notNull(),
  explanation: text("explanation").notNull(),
  provider: text("provider").notNull(),
  model: text("model"),
  createdAt,
  updatedAt,
});

export const covers = pgTable(
  "covers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetAccessId: text("asset_access_id").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull().default("image/png"),
    generationSource: text("generation_source").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("covers_asset_access_id_unique").on(table.assetAccessId),
    index("covers_article_idx").on(table.articleId),
  ],
);

export const weeklyEditions = pgTable("weekly_editions", {
  id: text("id").primaryKey(),
  status: editionStatus("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt,
  updatedAt,
});

export const editionDeliveries = pgTable("edition_deliveries", {
  editionId: text("edition_id")
    .primaryKey()
    .references(() => weeklyEditions.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("amazon-ses"),
  deliveryFormat: text("delivery_format").notNull().default("per-article-v1"),
  status: deliveryStatus("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  providerMessageId: text("provider_message_id"),
  lastErrorCode: text("last_error_code"),
  sendingStartedAt: timestamp("sending_started_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt,
  updatedAt,
});

export const editionDocumentDeliveries = pgTable(
  "edition_document_deliveries",
  {
    editionId: text("edition_id")
      .notNull()
      .references(() => weeklyEditions.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    provider: text("provider").notNull().default("amazon-ses"),
    status: deliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerMessageId: text("provider_message_id"),
    lastErrorCode: text("last_error_code"),
    sendingStartedAt: timestamp("sending_started_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.editionId, table.articleId] }),
    uniqueIndex("edition_document_deliveries_rank_unique").on(table.editionId, table.rank),
  ],
);

export const weeklySelections = pgTable(
  "weekly_selections",
  {
    editionId: text("edition_id")
      .notNull()
      .references(() => weeklyEditions.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id),
    rank: integer("rank").notNull(),
    scoreAtSelection: integer("score_at_selection").notNull(),
    sourceIdAtSelection: text("source_id_at_selection").notNull(),
    categoryAtSelection: text("category_at_selection").$type<SourceCategory>().notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.editionId, table.articleId] }),
    uniqueIndex("weekly_selections_rank_unique").on(table.editionId, table.rank),
    uniqueIndex("weekly_selections_source_unique").on(table.editionId, table.sourceIdAtSelection),
  ],
);

export const articleOverrides = pgTable("article_overrides", {
  articleId: uuid("article_id")
    .primaryKey()
    .references(() => articles.id, { onDelete: "cascade" }),
  mode: overrideMode("mode").notNull(),
  reason: text("reason"),
  actorLogin: text("actor_login").notNull(),
  updatedAt,
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorLogin: text("actor_login").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityIdHash: text("entity_id_hash").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, boolean | number | string | null>>()
      .notNull()
      .default({}),
    createdAt,
  },
  (table) => [index("audit_events_created_at_idx").on(table.createdAt)],
);

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: text("worker_id").primaryKey(),
  serviceVersion: text("service_version").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  details: jsonb("details").$type<{ activeJobs: number; failedJobs: number }>().notNull().default({
    activeJobs: 0,
    failedJobs: 0,
  }),
});

export const accessState = pgTable(
  "access_state",
  {
    id: integer("id").primaryKey().default(1),
    feedKeyDigest: text("feed_key_digest").notNull(),
    previousFeedKeyDigest: text("previous_feed_key_digest"),
    previousValidUntil: timestamp("previous_valid_until", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt,
  },
  (table) => [check("access_state_singleton", sql`${table.id} = 1`)],
);
