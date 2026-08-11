CREATE TYPE "ingestion_kind" AS ENUM ('feed', 'autodiscover', 'hacker-news');
CREATE TYPE "extraction_status" AS ENUM ('pending', 'complete', 'failed', 'paywalled');
CREATE TYPE "edition_status" AS ENUM ('draft', 'publishing', 'published', 'failed');
CREATE TYPE "override_mode" AS ENUM ('none', 'promote', 'suppress', 'lock');

CREATE TABLE "sources" (
  "id" text PRIMARY KEY,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "ingestion_kind" ingestion_kind NOT NULL,
  "configured_url" text NOT NULL,
  "poll_interval_minutes" integer NOT NULL DEFAULT 60,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "feed_cursors" (
  "source_id" text PRIMARY KEY REFERENCES "sources"("id") ON DELETE CASCADE,
  "resolved_feed_url" text,
  "etag" text,
  "last_modified" text,
  "last_polled_at" timestamptz,
  "next_poll_at" timestamptz,
  "last_error_code" text,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_access_id" text NOT NULL UNIQUE,
  "source_id" text NOT NULL REFERENCES "sources"("id"),
  "canonical_url" text NOT NULL,
  "content_fingerprint" text NOT NULL,
  "title" text NOT NULL,
  "byline" text,
  "excerpt" text,
  "summary" text,
  "content_html" text,
  "text_content" text,
  "image_url" text,
  "published_at" timestamptz,
  "extraction_status" extraction_status NOT NULL DEFAULT 'pending',
  "extraction_diagnostics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "word_count" integer NOT NULL DEFAULT 0,
  "reading_minutes" integer NOT NULL DEFAULT 0,
  "body_expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("source_id", "canonical_url")
);
CREATE INDEX "articles_fingerprint_idx" ON "articles" ("content_fingerprint");
CREATE INDEX "articles_published_at_idx" ON "articles" ("published_at");

CREATE TABLE "evaluations" (
  "article_id" uuid PRIMARY KEY REFERENCES "articles"("id") ON DELETE CASCADE,
  "depth" integer NOT NULL,
  "originality" integer NOT NULL,
  "relevance" integer NOT NULL,
  "readability" integer NOT NULL,
  "visual_value" integer NOT NULL,
  "recency" integer NOT NULL,
  "penalties" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "total" integer NOT NULL,
  "explanation" text NOT NULL,
  "provider" text NOT NULL,
  "model" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "covers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "asset_access_id" text NOT NULL UNIQUE,
  "article_id" uuid NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "storage_key" text NOT NULL,
  "content_type" text NOT NULL DEFAULT 'image/png',
  "generation_source" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "covers_article_idx" ON "covers" ("article_id");

CREATE TABLE "weekly_editions" (
  "id" text PRIMARY KEY,
  "status" edition_status NOT NULL DEFAULT 'draft',
  "scheduled_at" timestamptz NOT NULL,
  "published_at" timestamptz,
  "failure_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "weekly_selections" (
  "edition_id" text NOT NULL REFERENCES "weekly_editions"("id") ON DELETE CASCADE,
  "article_id" uuid NOT NULL REFERENCES "articles"("id"),
  "rank" integer NOT NULL,
  "score_at_selection" integer NOT NULL,
  "source_id_at_selection" text NOT NULL,
  "category_at_selection" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("edition_id", "article_id"),
  UNIQUE ("edition_id", "rank"),
  UNIQUE ("edition_id", "source_id_at_selection")
);

CREATE TABLE "article_overrides" (
  "article_id" uuid PRIMARY KEY REFERENCES "articles"("id") ON DELETE CASCADE,
  "mode" override_mode NOT NULL,
  "reason" text,
  "actor_login" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_login" text NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id_hash" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" ("created_at");

CREATE TABLE "worker_heartbeats" (
  "worker_id" text PRIMARY KEY,
  "service_version" text NOT NULL,
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "details" jsonb NOT NULL DEFAULT '{"activeJobs":0,"failedJobs":0}'::jsonb
);

CREATE TABLE "access_state" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "feed_key_digest" text NOT NULL,
  "previous_feed_key_digest" text,
  "previous_valid_until" timestamptz,
  "rotated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
