import { renderWeeklyFeed } from "@inkrelay/core";
import { isFeedKeyAccepted, latestWeeklyEntries } from "@inkrelay/db";

import { toPublishedFeedEntries } from "@/lib/feed";
import { database, runtimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ feedKey: string }> }) {
  const { feedKey } = await context.params;
  const config = runtimeConfig();
  const connection = database();
  if (!(await isFeedKeyAccepted(connection, feedKey, config.feedAccessKey))) {
    return new Response("Not found", { status: 404 });
  }
  const latest = await latestWeeklyEntries(connection);
  if (!latest.editionId) return new Response("No published edition", { status: 503 });
  const entries = toPublishedFeedEntries(latest.entries, config.publicBaseUrl);
  if (entries.length !== 10) return new Response("Edition is incomplete", { status: 503 });
  const xml = renderWeeklyFeed({
    editionId: latest.editionId,
    publicBaseUrl: config.publicBaseUrl,
    feedPath: `/f/${feedKey}/weekly.xml`,
    entries,
  });
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
