import { SOURCE_CATEGORIES, type SourceCategory } from "./domain.js";

export interface DeterministicEvaluationInput {
  title: string;
  excerpt: string | null;
  wordCount: number;
  imageCount: number;
  publishedAt: string | null;
  now?: Date;
}

export interface ArticleEvaluation {
  depth: number;
  originality: number;
  relevance: number;
  readability: number;
  visualValue: number;
  recency: number;
  penalties: string[];
  total: number;
  explanation: string;
}

export type ArticleOverride = "none" | "promote" | "suppress" | "lock";

export interface SelectionCandidate {
  articleId: string;
  sourceId: string;
  category: SourceCategory;
  score: number;
  publishedAt: string;
  duplicateKey: string;
  override: ArticleOverride;
}

export interface WeeklyEdition {
  id: string;
  status: "published";
  publishedAt: string;
  selections: SelectionCandidate[];
}

export interface WeeklySelectionOptions {
  editionId: string;
  publishedAt: string;
  target?: number;
  preferredCategoryLimit?: number;
}

const TECHNICAL_LANGUAGE =
  /architecture|algorithm|benchmark|implementation|rendering|inference|pipeline|system|research|shader|simulation|model|engineering/iu;
const WEAK_POST = /podcast|announcement|release notes?|changelog|jobs?|sale|livestream|webinar/iu;

export function evaluateDeterministically(input: DeterministicEvaluationInput): ArticleEvaluation {
  const now = input.now ?? new Date();
  const body = `${input.title} ${input.excerpt ?? ""}`;
  const depth = clamp(Math.round((input.wordCount / 2_000) * 100));
  const originality = TECHNICAL_LANGUAGE.test(body) ? 90 : 55;
  const relevance = TECHNICAL_LANGUAGE.test(body) ? 90 : 65;
  const readability = input.wordCount >= 600 && input.wordCount <= 5_000 ? 90 : 55;
  const visualValue = clamp(input.imageCount * 22);
  const ageDays = input.publishedAt
    ? Math.max(0, (now.valueOf() - new Date(input.publishedAt).valueOf()) / 86_400_000)
    : 30;
  const recency = clamp(Math.round(100 - ageDays * 2));
  const penalties: string[] = [];
  if (input.wordCount < 400) penalties.push("short-content");
  if (WEAK_POST.test(input.title)) penalties.push("podcast-or-announcement");

  const weighted =
    depth * 0.25 +
    originality * 0.15 +
    relevance * 0.2 +
    readability * 0.15 +
    visualValue * 0.1 +
    recency * 0.15;
  const penaltyPoints =
    (penalties.includes("short-content") ? 25 : 0) +
    (penalties.includes("podcast-or-announcement") ? 20 : 0);
  const total = clamp(Math.round(weighted - penaltyPoints));

  return {
    depth,
    originality,
    relevance,
    readability,
    visualValue,
    recency,
    penalties,
    total,
    explanation: penalties.length
      ? `Deterministic score ${total}; penalties: ${penalties.join(", ")}.`
      : `Deterministic score ${total}; substantial technical reading candidate.`,
  };
}

export function selectWeeklyEdition(
  candidates: SelectionCandidate[],
  options: WeeklySelectionOptions,
): WeeklyEdition {
  const target = options.target ?? 10;
  const preferredCategoryLimit = options.preferredCategoryLimit ?? 3;
  const ranked = candidates
    .filter((candidate) => candidate.override !== "suppress")
    .sort(compareCandidates);
  const uniqueSourceCount = new Set(ranked.map((candidate) => candidate.sourceId)).size;
  if (uniqueSourceCount < target) {
    throw new Error(`Edition requires ${target} valid distinct-source candidates`);
  }

  const selected: SelectionCandidate[] = [];
  const sources = new Set<string>();
  const duplicateKeys = new Set<string>();
  const categoryCounts = new Map<SourceCategory, number>();

  for (const candidate of ranked.filter((item) => item.override === "lock")) {
    addCandidate(candidate, selected, sources, duplicateKeys, categoryCounts, target);
  }
  for (const category of SOURCE_CATEGORIES) {
    if (selected.length >= target) break;
    if ((categoryCounts.get(category) ?? 0) > 0) continue;
    for (const candidate of ranked) {
      if (candidate.category !== category) continue;
      const previousLength = selected.length;
      addCandidate(candidate, selected, sources, duplicateKeys, categoryCounts, target);
      if (selected.length > previousLength) break;
    }
  }
  for (const candidate of ranked) {
    if (selected.length >= target) break;
    if ((categoryCounts.get(candidate.category) ?? 0) >= preferredCategoryLimit) continue;
    addCandidate(candidate, selected, sources, duplicateKeys, categoryCounts, target);
  }
  for (const candidate of ranked) {
    if (selected.length >= target) break;
    addCandidate(candidate, selected, sources, duplicateKeys, categoryCounts, target);
  }
  if (selected.length !== target) {
    throw new Error(`Edition requires ${target} valid distinct-source candidates`);
  }

  return {
    id: options.editionId,
    status: "published",
    publishedAt: options.publishedAt,
    selections: selected,
  };
}

function compareCandidates(left: SelectionCandidate, right: SelectionCandidate): number {
  const overrideOrder: Record<ArticleOverride, number> = {
    lock: 3,
    promote: 2,
    none: 1,
    suppress: 0,
  };
  return (
    overrideOrder[right.override] - overrideOrder[left.override] ||
    right.score - left.score ||
    new Date(right.publishedAt).valueOf() - new Date(left.publishedAt).valueOf() ||
    left.articleId.localeCompare(right.articleId)
  );
}

function addCandidate(
  candidate: SelectionCandidate,
  selected: SelectionCandidate[],
  sources: Set<string>,
  duplicateKeys: Set<string>,
  categoryCounts: Map<SourceCategory, number>,
  target: number,
): void {
  if (selected.length >= target) return;
  if (sources.has(candidate.sourceId) || duplicateKeys.has(candidate.duplicateKey)) return;
  selected.push(candidate);
  sources.add(candidate.sourceId);
  duplicateKeys.add(candidate.duplicateKey);
  categoryCounts.set(candidate.category, (categoryCounts.get(candidate.category) ?? 0) + 1);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
