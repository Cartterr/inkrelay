import { isFeedKeyAccepted, latestWeeklyEntries } from "@inkrelay/db";

import { assetStore, database, runtimeConfig } from "@/lib/runtime";
import { createWeeklyEpubResponse } from "@/lib/weekly-epub-response";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ feedKey: string }> }) {
  const { feedKey } = await context.params;
  const config = runtimeConfig();
  const connection = database();
  const store = assetStore();
  return createWeeklyEpubResponse(feedKey, {
    acceptFeedKey: (candidate) => isFeedKeyAccepted(connection, candidate, config.feedAccessKey),
    loadEdition: () => latestWeeklyEntries(connection),
    loadAsset: (storageKey) => store.get(storageKey),
  });
}
