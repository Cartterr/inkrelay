import { z } from "zod";

export const JOB_NAMES = [
  "poll-source",
  "extract-article",
  "evaluate-article",
  "generate-cover",
  "publish-edition",
  "cleanup-retention",
] as const;

export type JobName = (typeof JOB_NAMES)[number];

const payloadSchemas = {
  "poll-source": z.object({ sourceId: z.string().min(1).max(100) }),
  "extract-article": z.object({ articleId: z.string().uuid() }),
  "evaluate-article": z.object({ articleId: z.string().uuid() }),
  "generate-cover": z.object({ articleId: z.string().uuid(), force: z.boolean().optional() }),
  "publish-edition": z.object({ editionId: z.string().min(1).max(40) }),
  "cleanup-retention": z.object({ requestedAt: z.string().datetime() }),
} satisfies Record<JobName, z.ZodType>;

export function parseJobPayload(name: JobName, payload: unknown): unknown {
  return payloadSchemas[name].parse(payload);
}

export function retentionCutoff(now = new Date()): Date {
  return new Date(now.valueOf() - 90 * 24 * 60 * 60 * 1_000);
}
