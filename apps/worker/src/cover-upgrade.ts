import {
  latestPublishedEditionId,
  weeklyEntriesByEdition,
  type DatabaseConnection,
} from "@inkrelay/db";
import { COVER_RENDERER_VERSION } from "@inkrelay/rendering";
import type { PgBoss } from "pg-boss";

import { DEFAULT_JOB_OPTIONS } from "./queue.js";

interface CoverVersionRow {
  articleId: string;
  coverGenerationSource: string | null;
}

export function coverUpgradeArticleIds(rows: CoverVersionRow[]): string[] {
  const state = new Map<string, boolean>();
  for (const row of rows) {
    const isCurrent = row.coverGenerationSource?.endsWith(`:${COVER_RENDERER_VERSION}`) ?? false;
    state.set(row.articleId, (state.get(row.articleId) ?? false) || isCurrent);
  }
  return [...state.entries()].filter(([, isCurrent]) => !isCurrent).map(([articleId]) => articleId);
}

export async function enqueueLatestEditionCoverUpgrade(
  boss: PgBoss,
  connection: DatabaseConnection,
): Promise<number> {
  const editionId = await latestPublishedEditionId(connection);
  if (!editionId) return 0;
  const rows = await weeklyEntriesByEdition(connection, editionId);
  const articleIds = coverUpgradeArticleIds(rows);
  for (const articleId of articleIds) {
    await boss.send(
      "generate-cover",
      { articleId, force: true },
      {
        ...DEFAULT_JOB_OPTIONS,
        singletonKey: `cover-upgrade:${COVER_RENDERER_VERSION}:${articleId}`,
      },
    );
  }
  return articleIds.length;
}
