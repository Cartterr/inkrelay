import { and, desc, eq, inArray, isNotNull, lt, notInArray, sql } from "drizzle-orm";

import {
  generateOpaqueId,
  hashIdentifier,
  generateFeedAccessKey,
  verifyFeedAccessKey,
  type ArticleEvaluation,
  type ExtractedArticle,
  type FeedEntry,
  type SourceCategory,
  type SourceDefinition,
} from "@inkrelay/core";

import type { DatabaseConnection } from "./client.js";
import {
  articleOverrides,
  accessState,
  articles,
  auditEvents,
  covers,
  editionDocumentDeliveries,
  editionDeliveries,
  evaluations,
  feedCursors,
  sources,
  weeklyEditions,
  weeklySelections,
  workerHeartbeats,
} from "./schema.js";

export const CURRENT_KINDLE_DELIVERY_FORMAT = "per-article-v1";
const DELIVERY_LEASE_MS = 15 * 60 * 1_000;

export interface PublicationSelection {
  articleId: string;
  sourceId: string;
  score: number;
  category: SourceCategory;
}

export function assertPublicationSet(selection: PublicationSelection[]): void {
  if (selection.length !== 10) throw new Error("Publication requires exactly 10 articles");
  if (new Set(selection.map((item) => item.articleId)).size !== 10) {
    throw new Error("Publication requires 10 distinct articles");
  }
  if (new Set(selection.map((item) => item.sourceId)).size !== 10) {
    throw new Error("Publication requires 10 distinct sources");
  }
}

export async function seedSourceRegistry(
  connection: DatabaseConnection,
  registry: readonly SourceDefinition[],
): Promise<void> {
  if (registry.length !== 58) throw new Error("Registry seed requires exactly 58 sources");
  await connection.db.transaction(async (transaction) => {
    for (const source of registry) {
      await transaction
        .insert(sources)
        .values({
          id: source.id,
          slug: source.slug,
          name: source.name,
          category: source.category,
          ingestionKind: source.ingestion.kind,
          configuredUrl: source.ingestion.url,
          pollIntervalMinutes: source.pollIntervalMinutes,
          enabled: source.enabled,
        })
        .onConflictDoUpdate({
          target: sources.id,
          set: {
            slug: source.slug,
            name: source.name,
            category: source.category,
            ingestionKind: source.ingestion.kind,
            configuredUrl: source.ingestion.url,
            pollIntervalMinutes: source.pollIntervalMinutes,
            enabled: source.enabled,
            updatedAt: new Date(),
          },
        });
    }
    await transaction
      .update(sources)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        notInArray(
          sources.id,
          registry.map((source) => source.id),
        ),
      );
  });
}

export async function sourceState(connection: DatabaseConnection, sourceId: string) {
  const rows = await connection.db
    .select({ source: sources, cursor: feedCursors })
    .from(sources)
    .leftJoin(feedCursors, eq(feedCursors.sourceId, sources.id))
    .where(and(eq(sources.id, sourceId), eq(sources.enabled, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function persistFeedCursor(
  connection: DatabaseConnection,
  input: {
    sourceId: string;
    resolvedFeedUrl: string;
    etag: string | null;
    lastModified: string | null;
    lastErrorCode?: string | null;
  },
): Promise<void> {
  const now = new Date();
  await connection.db
    .insert(feedCursors)
    .values({
      sourceId: input.sourceId,
      resolvedFeedUrl: input.resolvedFeedUrl,
      etag: input.etag,
      lastModified: input.lastModified,
      lastPolledAt: now,
      nextPollAt: new Date(now.valueOf() + 60 * 60 * 1_000),
      lastErrorCode: input.lastErrorCode ?? null,
      consecutiveFailures: input.lastErrorCode ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: feedCursors.sourceId,
      set: {
        resolvedFeedUrl: input.resolvedFeedUrl,
        etag: input.etag,
        lastModified: input.lastModified,
        lastPolledAt: now,
        nextPollAt: new Date(now.valueOf() + 60 * 60 * 1_000),
        lastErrorCode: input.lastErrorCode ?? null,
        consecutiveFailures: input.lastErrorCode ? sql`${feedCursors.consecutiveFailures} + 1` : 0,
        updatedAt: now,
      },
    });
}

export async function upsertFeedEntry(
  connection: DatabaseConnection,
  entry: FeedEntry,
): Promise<{ articleId: string; isNew: boolean }> {
  const existing = await connection.db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.sourceId, entry.sourceId), eq(articles.canonicalUrl, entry.url)))
    .limit(1);
  if (existing[0]) return { articleId: existing[0].id, isNew: false };

  const inserted = await connection.db
    .insert(articles)
    .values({
      articleAccessId: generateOpaqueId(),
      sourceId: entry.sourceId,
      canonicalUrl: entry.url,
      contentFingerprint: hashIdentifier(entry.url),
      title: entry.title,
      excerpt: entry.excerpt,
      publishedAt: entry.publishedAt ? new Date(entry.publishedAt) : null,
      bodyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000),
    })
    .onConflictDoNothing()
    .returning({ id: articles.id });
  if (inserted[0]) return { articleId: inserted[0].id, isNew: true };

  const raced = await connection.db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.sourceId, entry.sourceId), eq(articles.canonicalUrl, entry.url)))
    .limit(1);
  if (!raced[0]) throw new Error("Article insert conflict could not be resolved");
  return { articleId: raced[0].id, isNew: false };
}

export async function articleForWork(connection: DatabaseConnection, articleId: string) {
  const rows = await connection.db
    .select({ article: articles, source: sources })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(eq(articles.id, articleId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveExtraction(
  connection: DatabaseConnection,
  articleId: string,
  extracted: ExtractedArticle,
): Promise<void> {
  await connection.db
    .update(articles)
    .set({
      title: extracted.title,
      byline: extracted.byline,
      excerpt: extracted.excerpt,
      canonicalUrl: extracted.canonicalUrl,
      contentFingerprint: extracted.contentFingerprint,
      imageUrl: extracted.imageUrl,
      publishedAt: extractionPublishedAtUpdate(extracted.publishedAt),
      contentHtml: extracted.contentHtml,
      textContent: extracted.textContent,
      wordCount: extracted.wordCount,
      readingMinutes: extracted.readingMinutes,
      extractionStatus: "complete",
      extractionDiagnostics: {},
      bodyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000),
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));
}

export function extractionPublishedAtUpdate(
  extractedPublishedAt: string | null | undefined,
): Date | undefined {
  return extractedPublishedAt ? new Date(extractedPublishedAt) : undefined;
}

export async function markExtractionFailed(
  connection: DatabaseConnection,
  articleId: string,
  code: string,
): Promise<void> {
  await connection.db
    .update(articles)
    .set({
      extractionStatus: "failed",
      extractionDiagnostics: { code },
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));
}

export async function saveEvaluation(
  connection: DatabaseConnection,
  articleId: string,
  evaluation: ArticleEvaluation,
  provider: string,
  model: string | null,
): Promise<void> {
  await connection.db
    .insert(evaluations)
    .values({ articleId, ...evaluation, provider, model })
    .onConflictDoUpdate({
      target: evaluations.articleId,
      set: { ...evaluation, provider, model, updatedAt: new Date() },
    });
}

export async function saveSummary(
  connection: DatabaseConnection,
  articleId: string,
  summary: string,
): Promise<void> {
  await connection.db
    .update(articles)
    .set({ summary, updatedAt: new Date() })
    .where(eq(articles.id, articleId));
}

export async function saveCover(
  connection: DatabaseConnection,
  input: {
    articleId: string;
    assetAccessId: string;
    storageKey: string;
    generationSource: string;
  },
): Promise<void> {
  await connection.db.insert(covers).values({
    ...input,
    contentType: "image/png",
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000),
  });
}

export async function weeklyCandidates(connection: DatabaseConnection, since: Date) {
  return connection.db
    .select({
      articleId: articles.id,
      sourceId: articles.sourceId,
      category: sources.category,
      score: evaluations.total,
      publishedAt: articles.publishedAt,
      duplicateKey: articles.contentFingerprint,
      override: articleOverrides.mode,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(evaluations, eq(evaluations.articleId, articles.id))
    .innerJoin(covers, eq(covers.articleId, articles.id))
    .leftJoin(articleOverrides, eq(articleOverrides.articleId, articles.id))
    .where(
      and(
        eq(articles.extractionStatus, "complete"),
        isNotNull(articles.contentHtml),
        sql`${articles.publishedAt} >= ${since}`,
      ),
    )
    .orderBy(desc(evaluations.total), desc(articles.publishedAt));
}

export async function publishEditionAtomically(
  connection: DatabaseConnection,
  input: {
    editionId: string;
    scheduledAt: Date;
    publishedAt: Date;
    selection: PublicationSelection[];
  },
): Promise<void> {
  assertPublicationSet(input.selection);
  await connection.db.transaction(async (transaction) => {
    await transaction
      .insert(weeklyEditions)
      .values({ id: input.editionId, status: "publishing", scheduledAt: input.scheduledAt })
      .onConflictDoUpdate({
        target: weeklyEditions.id,
        set: { status: "publishing", failureReason: null, updatedAt: new Date() },
      });
    await transaction.execute(
      sql`select id from weekly_editions where id = ${input.editionId} for update`,
    );
    await transaction
      .delete(weeklySelections)
      .where(eq(weeklySelections.editionId, input.editionId));
    await transaction.insert(weeklySelections).values(
      input.selection.map((item, index) => ({
        editionId: input.editionId,
        articleId: item.articleId,
        rank: index + 1,
        scoreAtSelection: item.score,
        sourceIdAtSelection: item.sourceId,
        categoryAtSelection: item.category,
      })),
    );
    await transaction
      .update(weeklyEditions)
      .set({ status: "published", publishedAt: input.publishedAt, updatedAt: new Date() })
      .where(eq(weeklyEditions.id, input.editionId));
  });
}

export async function failEdition(
  connection: DatabaseConnection,
  editionId: string,
  scheduledAt: Date,
  reason: string,
): Promise<void> {
  await connection.db
    .insert(weeklyEditions)
    .values({ id: editionId, scheduledAt, status: "failed", failureReason: reason.slice(0, 500) })
    .onConflictDoUpdate({
      target: weeklyEditions.id,
      set: { status: "failed", failureReason: reason.slice(0, 500), updatedAt: new Date() },
    });
}

export async function claimEditionDelivery(
  connection: DatabaseConnection,
  editionId: string,
): Promise<{ claimed: boolean; status: "pending" | "sending" | "delivered" | "failed" }> {
  return connection.db.transaction(async (transaction) => {
    await transaction
      .insert(editionDeliveries)
      .values({ editionId, status: "pending", deliveryFormat: CURRENT_KINDLE_DELIVERY_FORMAT })
      .onConflictDoNothing();
    await transaction.execute(
      sql`select edition_id from edition_deliveries where edition_id = ${editionId} for update`,
    );
    const rows = await transaction
      .select({
        status: editionDeliveries.status,
        deliveryFormat: editionDeliveries.deliveryFormat,
        sendingStartedAt: editionDeliveries.sendingStartedAt,
      })
      .from(editionDeliveries)
      .where(eq(editionDeliveries.editionId, editionId))
      .limit(1);
    const current = rows[0];
    if (!current) throw new Error("Edition delivery record could not be created");
    const currentLeaseIsFresh =
      current.status === "sending" &&
      current.sendingStartedAt &&
      Date.now() - current.sendingStartedAt.valueOf() < DELIVERY_LEASE_MS;
    if (
      current.deliveryFormat === CURRENT_KINDLE_DELIVERY_FORMAT &&
      (current.status === "delivered" || currentLeaseIsFresh)
    ) {
      return { claimed: false, status: current.status };
    }
    await transaction
      .update(editionDeliveries)
      .set({
        status: "sending",
        deliveryFormat: CURRENT_KINDLE_DELIVERY_FORMAT,
        attemptCount: sql`${editionDeliveries.attemptCount} + 1`,
        sendingStartedAt: new Date(),
        lastErrorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(editionDeliveries.editionId, editionId));
    return { claimed: true, status: current.status };
  });
}

export async function markEditionDelivered(
  connection: DatabaseConnection,
  editionId: string,
  providerMessageId: string | null,
): Promise<void> {
  await connection.db
    .update(editionDeliveries)
    .set({
      status: "delivered",
      deliveryFormat: CURRENT_KINDLE_DELIVERY_FORMAT,
      providerMessageId,
      deliveredAt: new Date(),
      lastErrorCode: null,
      updatedAt: new Date(),
    })
    .where(eq(editionDeliveries.editionId, editionId));
}

export async function claimEditionDocumentDelivery(
  connection: DatabaseConnection,
  input: { editionId: string; articleId: string; rank: number },
): Promise<{ claimed: boolean; status: "pending" | "sending" | "delivered" | "failed" }> {
  return connection.db.transaction(async (transaction) => {
    await transaction
      .insert(editionDocumentDeliveries)
      .values({ ...input, status: "pending" })
      .onConflictDoNothing();
    await transaction.execute(
      sql`select edition_id from edition_document_deliveries where edition_id = ${input.editionId} and article_id = ${input.articleId} for update`,
    );
    const rows = await transaction
      .select({
        status: editionDocumentDeliveries.status,
        sendingStartedAt: editionDocumentDeliveries.sendingStartedAt,
      })
      .from(editionDocumentDeliveries)
      .where(
        and(
          eq(editionDocumentDeliveries.editionId, input.editionId),
          eq(editionDocumentDeliveries.articleId, input.articleId),
        ),
      )
      .limit(1);
    const current = rows[0];
    if (!current) throw new Error("Document delivery record could not be created");
    const leaseIsFresh =
      current.status === "sending" &&
      current.sendingStartedAt &&
      Date.now() - current.sendingStartedAt.valueOf() < DELIVERY_LEASE_MS;
    if (current.status === "delivered" || leaseIsFresh) {
      return { claimed: false, status: current.status };
    }
    await transaction
      .update(editionDocumentDeliveries)
      .set({
        status: "sending",
        attemptCount: sql`${editionDocumentDeliveries.attemptCount} + 1`,
        sendingStartedAt: new Date(),
        lastErrorCode: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(editionDocumentDeliveries.editionId, input.editionId),
          eq(editionDocumentDeliveries.articleId, input.articleId),
        ),
      );
    return { claimed: true, status: current.status };
  });
}

export async function markEditionDocumentDelivered(
  connection: DatabaseConnection,
  input: { editionId: string; articleId: string; providerMessageId: string | null },
): Promise<void> {
  await connection.db
    .update(editionDocumentDeliveries)
    .set({
      status: "delivered",
      providerMessageId: input.providerMessageId,
      deliveredAt: new Date(),
      lastErrorCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(editionDocumentDeliveries.editionId, input.editionId),
        eq(editionDocumentDeliveries.articleId, input.articleId),
      ),
    );
}

export async function markEditionDocumentDeliveryFailed(
  connection: DatabaseConnection,
  input: { editionId: string; articleId: string; errorCode: string },
): Promise<void> {
  await connection.db
    .update(editionDocumentDeliveries)
    .set({ status: "failed", lastErrorCode: input.errorCode.slice(0, 120), updatedAt: new Date() })
    .where(
      and(
        eq(editionDocumentDeliveries.editionId, input.editionId),
        eq(editionDocumentDeliveries.articleId, input.articleId),
      ),
    );
}

export async function markEditionDeliveryFailed(
  connection: DatabaseConnection,
  editionId: string,
  errorCode: string,
): Promise<void> {
  await connection.db
    .update(editionDeliveries)
    .set({ status: "failed", lastErrorCode: errorCode.slice(0, 120), updatedAt: new Date() })
    .where(eq(editionDeliveries.editionId, editionId));
}

export async function latestPublishedEditionId(
  connection: DatabaseConnection,
): Promise<string | null> {
  const rows = await connection.db
    .select({ id: weeklyEditions.id })
    .from(weeklyEditions)
    .where(eq(weeklyEditions.status, "published"))
    .orderBy(desc(weeklyEditions.publishedAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function setArticleOverride(
  connection: DatabaseConnection,
  articleId: string,
  mode: "none" | "promote" | "suppress" | "lock",
  actorLogin: string,
  reason?: string,
): Promise<void> {
  await connection.db.transaction(async (transaction) => {
    await transaction
      .insert(articleOverrides)
      .values({ articleId, mode, actorLogin, reason })
      .onConflictDoUpdate({
        target: articleOverrides.articleId,
        set: { mode, actorLogin, reason, updatedAt: new Date() },
      });
    await transaction.insert(auditEvents).values({
      actorLogin,
      action: "article.override",
      entityType: "article",
      entityIdHash: hashIdentifier(articleId),
      metadata: { mode },
    });
  });
}

export async function heartbeat(
  connection: DatabaseConnection,
  workerId: string,
  serviceVersion: string,
  activeJobs: number,
  failedJobs: number,
): Promise<void> {
  await connection.db
    .insert(workerHeartbeats)
    .values({ workerId, serviceVersion, details: { activeJobs, failedJobs } })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerId,
      set: { serviceVersion, lastSeenAt: new Date(), details: { activeJobs, failedJobs } },
    });
}

export async function expiredAssets(connection: DatabaseConnection, now = new Date()) {
  return connection.db
    .select({ id: covers.id, storageKey: covers.storageKey })
    .from(covers)
    .where(lt(covers.expiresAt, now));
}

export async function completeRetentionCleanup(
  connection: DatabaseConnection,
  deletedCoverIds: string[],
  now = new Date(),
): Promise<void> {
  await connection.db.transaction(async (transaction) => {
    if (deletedCoverIds.length > 0) {
      await transaction.delete(covers).where(inArray(covers.id, deletedCoverIds));
    }
    await transaction
      .update(articles)
      .set({ contentHtml: null, textContent: null, imageUrl: null, updatedAt: now })
      .where(lt(articles.bodyExpiresAt, now));
  });
}

export async function isFeedKeyAccepted(
  connection: DatabaseConnection,
  candidate: string,
  bootstrapKey: string,
  now = new Date(),
): Promise<boolean> {
  const state = await connection.db
    .select()
    .from(accessState)
    .where(eq(accessState.id, 1))
    .limit(1);
  const active = state[0];
  if (!active) return verifyFeedAccessKey(candidate, hashIdentifier(bootstrapKey));
  if (verifyFeedAccessKey(candidate, active.feedKeyDigest)) return true;
  return Boolean(
    active.previousFeedKeyDigest &&
      active.previousValidUntil &&
      active.previousValidUntil > now &&
      verifyFeedAccessKey(candidate, active.previousFeedKeyDigest),
  );
}

export async function rotateFeedAccess(
  connection: DatabaseConnection,
  actorLogin: string,
  bootstrapKey: string,
): Promise<string> {
  const newKey = generateFeedAccessKey();
  await connection.db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(438612)`);
    const rows = await transaction.select().from(accessState).where(eq(accessState.id, 1)).limit(1);
    const previousDigest = rows[0]?.feedKeyDigest ?? hashIdentifier(bootstrapKey);
    const now = new Date();
    await transaction
      .insert(accessState)
      .values({
        id: 1,
        feedKeyDigest: hashIdentifier(newKey),
        previousFeedKeyDigest: previousDigest,
        previousValidUntil: new Date(now.valueOf() + 24 * 60 * 60 * 1_000),
        rotatedAt: now,
      })
      .onConflictDoUpdate({
        target: accessState.id,
        set: {
          feedKeyDigest: hashIdentifier(newKey),
          previousFeedKeyDigest: previousDigest,
          previousValidUntil: new Date(now.valueOf() + 24 * 60 * 60 * 1_000),
          rotatedAt: now,
          updatedAt: now,
        },
      });
    await transaction.insert(auditEvents).values({
      actorLogin,
      action: "feed-access.rotate",
      entityType: "access-state",
      entityIdHash: hashIdentifier("feed-access"),
      metadata: { previousGraceHours: 24 },
    });
  });
  return newKey;
}

export async function publishedEntriesForSource(
  connection: DatabaseConnection,
  sourceSlug: string,
  limit = 20,
) {
  const rows = await connection.db
    .select({
      articleId: articles.id,
      articleAccessId: articles.articleAccessId,
      slug: articles.id,
      sourceId: articles.sourceId,
      sourceName: sources.name,
      title: articles.title,
      summary: articles.summary,
      contentHtml: articles.contentHtml,
      originalUrl: articles.canonicalUrl,
      assetAccessId: covers.assetAccessId,
      publishedAt: weeklyEditions.publishedAt,
      coverCreatedAt: covers.createdAt,
    })
    .from(weeklySelections)
    .innerJoin(weeklyEditions, eq(weeklyEditions.id, weeklySelections.editionId))
    .innerJoin(articles, eq(articles.id, weeklySelections.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(covers, eq(covers.articleId, articles.id))
    .where(and(eq(weeklyEditions.status, "published"), eq(sources.slug, sourceSlug)))
    .orderBy(desc(weeklyEditions.publishedAt), desc(covers.createdAt))
    .limit(limit * 3);
  return uniquePublishedRows(rows).slice(0, limit);
}

export async function latestWeeklyEntries(connection: DatabaseConnection) {
  const editionId = await latestPublishedEditionId(connection);
  if (!editionId) return { editionId: null, entries: [] };
  return { editionId, entries: await weeklyEntriesByEdition(connection, editionId) };
}

export async function weeklyEntriesByEdition(connection: DatabaseConnection, editionId: string) {
  const rows = await connection.db
    .select({
      articleId: articles.id,
      articleAccessId: articles.articleAccessId,
      slug: articles.id,
      sourceId: articles.sourceId,
      sourceName: sources.name,
      title: articles.title,
      summary: articles.summary,
      contentHtml: articles.contentHtml,
      originalUrl: articles.canonicalUrl,
      assetAccessId: covers.assetAccessId,
      storageKey: covers.storageKey,
      coverContentType: covers.contentType,
      coverGenerationSource: covers.generationSource,
      publishedAt: weeklyEditions.publishedAt,
      coverCreatedAt: covers.createdAt,
      rank: weeklySelections.rank,
    })
    .from(weeklySelections)
    .innerJoin(weeklyEditions, eq(weeklyEditions.id, weeklySelections.editionId))
    .innerJoin(articles, eq(articles.id, weeklySelections.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(covers, eq(covers.articleId, articles.id))
    .where(and(eq(weeklySelections.editionId, editionId), eq(weeklyEditions.status, "published")))
    .orderBy(weeklySelections.rank, desc(covers.createdAt));
  return uniquePublishedRows(rows).sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
}

export async function publishedArticleByAccessId(
  connection: DatabaseConnection,
  articleAccessId: string,
) {
  const rows = await connection.db
    .select({ article: articles, source: sources, cover: covers })
    .from(weeklySelections)
    .innerJoin(weeklyEditions, eq(weeklyEditions.id, weeklySelections.editionId))
    .innerJoin(articles, eq(articles.id, weeklySelections.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(covers, eq(covers.articleId, articles.id))
    .where(
      and(
        eq(weeklyEditions.status, "published"),
        eq(articles.articleAccessId, articleAccessId),
        isNotNull(articles.contentHtml),
      ),
    )
    .orderBy(desc(covers.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function assetByAccessId(connection: DatabaseConnection, assetAccessId: string) {
  const rows = await connection.db
    .select({ storageKey: covers.storageKey, contentType: covers.contentType })
    .from(covers)
    .where(eq(covers.assetAccessId, assetAccessId))
    .limit(1);
  return rows[0] ?? null;
}

export async function dashboardSnapshot(connection: DatabaseConnection) {
  const [candidateRows, editionRows, heartbeatRows, auditRows] = await Promise.all([
    connection.db
      .select({
        articleId: articles.id,
        sourceId: articles.sourceId,
        duplicateKey: articles.contentFingerprint,
        title: articles.title,
        sourceName: sources.name,
        sourceCategory: sources.category,
        status: articles.extractionStatus,
        score: evaluations.total,
        explanation: evaluations.explanation,
        override: articleOverrides.mode,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .innerJoin(sources, eq(sources.id, articles.sourceId))
      .leftJoin(evaluations, eq(evaluations.articleId, articles.id))
      .leftJoin(articleOverrides, eq(articleOverrides.articleId, articles.id))
      .orderBy(desc(articles.publishedAt))
      .limit(100),
    connection.db
      .select({
        id: weeklyEditions.id,
        status: weeklyEditions.status,
        scheduledAt: weeklyEditions.scheduledAt,
        publishedAt: weeklyEditions.publishedAt,
        failureReason: weeklyEditions.failureReason,
        deliveryStatus: editionDeliveries.status,
        deliveryAttempts: editionDeliveries.attemptCount,
        deliveryErrorCode: editionDeliveries.lastErrorCode,
        deliveredAt: editionDeliveries.deliveredAt,
      })
      .from(weeklyEditions)
      .leftJoin(editionDeliveries, eq(editionDeliveries.editionId, weeklyEditions.id))
      .orderBy(desc(weeklyEditions.scheduledAt))
      .limit(12),
    connection.db
      .select()
      .from(workerHeartbeats)
      .orderBy(desc(workerHeartbeats.lastSeenAt))
      .limit(8),
    connection.db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(30),
  ]);
  return {
    candidates: candidateRows,
    editions: editionRows,
    heartbeats: heartbeatRows,
    audit: auditRows,
  };
}

export async function isSystemReady(connection: DatabaseConnection, now = new Date()) {
  const latest = await connection.db
    .select({ lastSeenAt: workerHeartbeats.lastSeenAt })
    .from(workerHeartbeats)
    .orderBy(desc(workerHeartbeats.lastSeenAt))
    .limit(1);
  return Boolean(latest[0] && now.valueOf() - latest[0].lastSeenAt.valueOf() < 90_000);
}

function uniquePublishedRows<T extends { articleId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.articleId)) return false;
    seen.add(row.articleId);
    return true;
  });
}
