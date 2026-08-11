export const SOURCE_CATEGORIES = [
  "ai",
  "software",
  "graphics",
  "vfx",
  "gaming",
  "robotics",
  "hardware",
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export type SourceIngestion =
  | { kind: "feed"; url: string }
  | { kind: "autodiscover"; url: string }
  | { kind: "hacker-news"; url: string };

export interface SourceDefinition {
  id: string;
  slug: string;
  name: string;
  category: SourceCategory;
  ingestion: SourceIngestion;
  pollIntervalMinutes: 60;
  enabled: true;
}

export function defineSource(
  source: Omit<SourceDefinition, "pollIntervalMinutes" | "enabled">,
): SourceDefinition {
  return { ...source, pollIntervalMinutes: 60, enabled: true };
}
