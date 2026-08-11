import {
  DeterministicAiProvider,
  OpenAiCompatibleProvider,
  buildConditionalHeaders,
  discoverFeedUrl,
  extractArticle,
  fetchTextSafely,
  generateOpaqueId,
  hashIdentifier,
  parseFeedXml,
  parseHackerNewsItems,
  selectWeeklyEdition,
  type AiProvider,
  type FeedEntry,
  type RuntimeConfig,
} from "@inkrelay/core";
import {
  articleForWork,
  completeRetentionCleanup,
  expiredAssets,
  failEdition,
  markExtractionFailed,
  parseJobPayload,
  persistFeedCursor,
  publishEditionAtomically,
  saveCover,
  saveEvaluation,
  saveExtraction,
  saveSummary,
  sourceState,
  upsertFeedEntry,
  weeklyCandidates,
  type DatabaseConnection,
} from "@inkrelay/db";
import { renderMonochromeCover, type AssetStore } from "@inkrelay/rendering";
import type { Logger } from "pino";
import type { Job, PgBoss } from "pg-boss";

import { DEFAULT_JOB_OPTIONS } from "./queue.js";

export interface WorkerDependencies {
  boss: PgBoss;
  connection: DatabaseConnection;
  config: RuntimeConfig;
  store: AssetStore;
  provider: AiProvider;
  logger: Logger;
}

export function createAiProvider(config: RuntimeConfig): AiProvider {
  return config.aiText
    ? new OpenAiCompatibleProvider({ ...config.aiText })
    : new DeterministicAiProvider();
}

export async function registerHandlers(dependencies: WorkerDependencies): Promise<void> {
  const { boss } = dependencies;
  await boss.work("poll-source", { batchSize: 1, localConcurrency: 4 }, (jobs) =>
    withJob(dependencies, "poll-source", jobs, handlePoll),
  );
  await boss.work("extract-article", { batchSize: 1, localConcurrency: 3 }, (jobs) =>
    withJob(dependencies, "extract-article", jobs, handleExtraction),
  );
  await boss.work("evaluate-article", { batchSize: 1, localConcurrency: 2 }, (jobs) =>
    withJob(dependencies, "evaluate-article", jobs, handleEvaluation),
  );
  await boss.work("generate-cover", { batchSize: 1, localConcurrency: 2 }, (jobs) =>
    withJob(dependencies, "generate-cover", jobs, handleCover),
  );
  await boss.work("publish-edition", { batchSize: 1, localConcurrency: 1 }, (jobs) =>
    withJob(dependencies, "publish-edition", jobs, handlePublication),
  );
  await boss.work("cleanup-retention", { batchSize: 1, localConcurrency: 1 }, (jobs) =>
    withJob(dependencies, "cleanup-retention", jobs, handleCleanup),
  );
}

async function withJob(
  dependencies: WorkerDependencies,
  name: Parameters<typeof parseJobPayload>[0],
  jobs: Job<unknown>[],
  handler: (dependencies: WorkerDependencies, payload: never) => Promise<void>,
): Promise<void> {
  const job = jobs[0];
  if (!job) return;
  const payload = parseJobPayload(name, job.data);
  dependencies.logger.info({ job: name, jobHash: hashIdentifier(job.id) }, "job.started");
  await handler(dependencies, payload as never);
  dependencies.logger.info({ job: name, jobHash: hashIdentifier(job.id) }, "job.completed");
}

async function handlePoll(
  dependencies: WorkerDependencies,
  payload: { sourceId: string },
): Promise<void> {
  const state = await sourceState(dependencies.connection, payload.sourceId);
  if (!state) throw new Error("Source is missing or disabled");
  if (state.source.ingestionKind === "hacker-news") {
    await pollHackerNews(dependencies, state.source.id, state.source.configuredUrl);
    return;
  }

  let feedUrl = state.cursor?.resolvedFeedUrl ?? state.source.configuredUrl;
  if (state.source.ingestionKind === "autodiscover" && !state.cursor?.resolvedFeedUrl) {
    const homepage = await fetchTextSafely(state.source.configuredUrl, {
      maxBytes: 2 * 1024 * 1024,
    });
    feedUrl = discoverFeedUrl(homepage.text, homepage.finalUrl) ?? "";
    if (!feedUrl) throw new Error("No RSS or Atom feed was discovered on the configured homepage");
  }

  const response = await fetchTextSafely(feedUrl, {
    headers: buildConditionalHeaders({
      etag: state.cursor?.etag,
      lastModified: state.cursor?.lastModified,
    }),
    maxBytes: 5 * 1024 * 1024,
  });
  await persistFeedCursor(dependencies.connection, {
    sourceId: state.source.id,
    resolvedFeedUrl: response.finalUrl,
    etag: response.etag ?? state.cursor?.etag ?? null,
    lastModified: response.lastModified ?? state.cursor?.lastModified ?? null,
  });
  if (response.notModified) return;

  const entries = await parseFeedXml(response.text, state.source.id);
  await persistEntries(dependencies, entries);
}

async function pollHackerNews(
  dependencies: WorkerDependencies,
  sourceId: string,
  bestStoriesUrl: string,
): Promise<void> {
  const response = await fetchTextSafely(bestStoriesUrl, { maxBytes: 512 * 1024 });
  const ids = JSON.parse(response.text) as unknown;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger))
    throw new Error("Hacker News returned invalid story IDs");
  const itemBase = new URL("./", bestStoriesUrl).toString();
  const items = await mapWithConcurrency((ids as number[]).slice(0, 40), 5, async (id) => {
    const item = await fetchTextSafely(new URL(`item/${id}.json`, itemBase).toString(), {
      maxBytes: 256 * 1024,
    });
    return JSON.parse(item.text) as Parameters<typeof parseHackerNewsItems>[0][number];
  });
  await persistFeedCursor(dependencies.connection, {
    sourceId,
    resolvedFeedUrl: bestStoriesUrl,
    etag: response.etag,
    lastModified: response.lastModified,
  });
  await persistEntries(dependencies, parseHackerNewsItems(items));
}

async function persistEntries(
  dependencies: WorkerDependencies,
  entries: FeedEntry[],
): Promise<void> {
  for (const entry of entries) {
    const persisted = await upsertFeedEntry(dependencies.connection, entry);
    if (persisted.isNew) {
      await dependencies.boss.send(
        "extract-article",
        { articleId: persisted.articleId },
        {
          ...DEFAULT_JOB_OPTIONS,
          singletonKey: `extract:${persisted.articleId}`,
        },
      );
    }
  }
}

async function handleExtraction(
  dependencies: WorkerDependencies,
  payload: { articleId: string },
): Promise<void> {
  const record = await articleForWork(dependencies.connection, payload.articleId);
  if (!record) throw new Error("Article does not exist");
  try {
    const response = await fetchTextSafely(record.article.canonicalUrl, {
      maxBytes: 8 * 1024 * 1024,
    });
    const extracted = extractArticle(response.text, response.finalUrl);
    await saveExtraction(dependencies.connection, payload.articleId, extracted);
    await dependencies.boss.send("evaluate-article", payload, {
      ...DEFAULT_JOB_OPTIONS,
      singletonKey: `evaluate:${payload.articleId}`,
    });
  } catch (error) {
    await markExtractionFailed(dependencies.connection, payload.articleId, errorCode(error));
    throw error;
  }
}

async function handleEvaluation(
  dependencies: WorkerDependencies,
  payload: { articleId: string },
): Promise<void> {
  const record = await articleForWork(dependencies.connection, payload.articleId);
  if (!record?.article.textContent) throw new Error("Article extraction is incomplete");
  const evaluation = await dependencies.provider.evaluate({
    title: record.article.title,
    excerpt: record.article.excerpt,
    wordCount: record.article.wordCount,
    imageCount: (record.article.contentHtml?.match(/<img\b/giu) ?? []).length,
    publishedAt: record.article.publishedAt?.toISOString() ?? null,
  });
  const summary = await dependencies.provider.summarize({
    title: record.article.title,
    excerpt: record.article.excerpt,
    textContent: record.article.textContent,
  });
  await saveEvaluation(
    dependencies.connection,
    payload.articleId,
    evaluation,
    dependencies.config.aiText ? "openai-compatible" : "deterministic",
    dependencies.config.aiText?.model ?? null,
  );
  await saveSummary(dependencies.connection, payload.articleId, summary);
  await dependencies.boss.send("generate-cover", payload, {
    ...DEFAULT_JOB_OPTIONS,
    singletonKey: `cover:${payload.articleId}`,
  });
}

async function handleCover(
  dependencies: WorkerDependencies,
  payload: { articleId: string; force?: boolean },
): Promise<void> {
  const record = await articleForWork(dependencies.connection, payload.articleId);
  if (!record) throw new Error("Article does not exist");
  let sourceImage: Buffer | undefined;
  if (record.article.imageUrl) {
    try {
      const image = await fetchTextSafely(record.article.imageUrl, { maxBytes: 10 * 1024 * 1024 });
      if (image.contentType?.startsWith("image/")) sourceImage = Buffer.from(image.bytes);
    } catch {
      dependencies.logger.warn(
        { articleHash: hashIdentifier(payload.articleId) },
        "cover.source_image_unavailable",
      );
    }
  }
  const cover = await renderMonochromeCover({
    title: record.article.title,
    sourceName: record.source.name,
    category: record.source.category,
    editionLabel: "INKRELAY / TECHNICAL EDITION",
    sourceImage,
  });
  const assetAccessId = generateOpaqueId();
  const storageKey = `covers/${hashIdentifier(payload.articleId)}/${assetAccessId}.png`;
  await dependencies.store.put(storageKey, cover, "image/png");
  await saveCover(dependencies.connection, {
    articleId: payload.articleId,
    assetAccessId,
    storageKey,
    generationSource: sourceImage ? "source-image" : "deterministic-fallback",
  });
}

async function handlePublication(
  dependencies: WorkerDependencies,
  payload: { editionId: string },
): Promise<void> {
  const now = new Date();
  try {
    const candidates = await weeklyCandidates(
      dependencies.connection,
      new Date(now.valueOf() - 14 * 24 * 60 * 60 * 1_000),
    );
    const edition = selectWeeklyEdition(
      candidates.map((candidate) => ({
        articleId: candidate.articleId,
        sourceId: candidate.sourceId,
        category: candidate.category,
        score: candidate.score,
        publishedAt: candidate.publishedAt?.toISOString() ?? new Date(0).toISOString(),
        duplicateKey: candidate.duplicateKey,
        override: candidate.override ?? "none",
      })),
      { editionId: payload.editionId, publishedAt: now.toISOString() },
    );
    await publishEditionAtomically(dependencies.connection, {
      editionId: payload.editionId,
      scheduledAt: now,
      publishedAt: now,
      selection: edition.selections.map((item) => ({
        articleId: item.articleId,
        sourceId: item.sourceId,
        score: item.score,
        category: item.category,
      })),
    });
  } catch (error) {
    await failEdition(dependencies.connection, payload.editionId, now, errorCode(error));
    throw error;
  }
}

async function handleCleanup(dependencies: WorkerDependencies): Promise<void> {
  const expired = await expiredAssets(dependencies.connection);
  const deletedIds: string[] = [];
  for (const asset of expired) {
    await dependencies.store.delete(asset.storageKey);
    deletedIds.push(asset.id);
  }
  await completeRetentionCleanup(dependencies.connection, deletedIds);
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  return error.message
    .toLocaleLowerCase("en-US")
    .replace(/https?:\/\/\S+/gu, "[url]")
    .replace(/[^a-z0-9]+/gu, "_")
    .slice(0, 120);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        const value = values[index];
        if (value !== undefined) result[index] = await mapper(value);
      }
    }),
  );
  return result;
}
