ALTER TABLE "edition_deliveries"
  ADD COLUMN "delivery_format" text NOT NULL DEFAULT 'weekly-single-v1';

ALTER TABLE "edition_deliveries"
  ALTER COLUMN "delivery_format" SET DEFAULT 'per-article-v1';

CREATE TABLE "edition_document_deliveries" (
  "edition_id" text NOT NULL REFERENCES "weekly_editions"("id") ON DELETE CASCADE,
  "article_id" uuid NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "rank" integer NOT NULL,
  "provider" text NOT NULL DEFAULT 'amazon-ses',
  "status" delivery_status NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "provider_message_id" text,
  "last_error_code" text,
  "sending_started_at" timestamptz,
  "delivered_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("edition_id", "article_id")
);

CREATE UNIQUE INDEX "edition_document_deliveries_rank_unique"
  ON "edition_document_deliveries" ("edition_id", "rank");
