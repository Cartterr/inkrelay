import { isFeedKeyAccepted, latestWeeklyEntries } from "@inkrelay/db";

import { createArticleEpubResponse } from "@/lib/article-epub-response";
import { assetStore, database, runtimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ feedKey: string; rank: string }> },
) {
  const { feedKey, rank: rawRank } = await context.params;
  const config = runtimeConfig();
  const connection = database();
  const store = assetStore();
  return createArticleEpubResponse(feedKey, Number.parseInt(rawRank, 10), {
    acceptFeedKey: (candidate) => isFeedKeyAccepted(connection, candidate, config.feedAccessKey),
    loadEdition: () => latestWeeklyEntries(connection),
    loadAsset: (storageKey) => store.get(storageKey),
  });
}
