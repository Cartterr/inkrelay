import { renderSourceFeed, sourceBySlug } from "@inkrelay/core";
import { isFeedKeyAccepted, publishedEntriesForSource } from "@inkrelay/db";

import { toPublishedFeedEntries } from "@/lib/feed";
import { database, runtimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ feedKey: string; sourceSlug: string }> },
) {
  const { feedKey, sourceSlug } = await context.params;
  const config = runtimeConfig();
  const connection = database();
  if (!(await isFeedKeyAccepted(connection, feedKey, config.feedAccessKey))) {
    return new Response("Not found", { status: 404 });
  }
  const source = sourceBySlug(sourceSlug);
  if (!source) return new Response("Not found", { status: 404 });
  const rows = await publishedEntriesForSource(connection, sourceSlug);
  const entries = toPublishedFeedEntries(rows, config.publicBaseUrl);
  const xml = renderSourceFeed({
    title: `${source.name} — InkRelay`,
    description: `Selected long-form reading from ${source.name}`,
    publicBaseUrl: config.publicBaseUrl,
    feedPath: `/f/${feedKey}/source/${sourceSlug}.xml`,
    entries,
  });
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
