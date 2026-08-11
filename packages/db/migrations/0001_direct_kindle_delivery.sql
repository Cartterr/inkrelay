CREATE TYPE "delivery_status" AS ENUM ('pending', 'sending', 'delivered', 'failed');

CREATE TABLE "edition_deliveries" (
  "edition_id" text PRIMARY KEY REFERENCES "weekly_editions"("id") ON DELETE CASCADE,
  "provider" text NOT NULL DEFAULT 'amazon-ses',
  "status" delivery_status NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "provider_message_id" text,
  "last_error_code" text,
  "sending_started_at" timestamptz,
  "delivered_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
