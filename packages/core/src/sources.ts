import { SOURCE_CATEGORIES } from "./domain.js";
import { AI_AND_SOFTWARE_SOURCES } from "./sources/ai-software.js";
import { GAMING_SOURCES } from "./sources/gaming.js";
import { VISUAL_AND_HARDWARE_SOURCES } from "./sources/visual-hardware.js";

export { SOURCE_CATEGORIES } from "./domain.js";
export type { SourceCategory, SourceDefinition, SourceIngestion } from "./domain.js";

export const SOURCES = Object.freeze([
  ...AI_AND_SOFTWARE_SOURCES,
  ...VISUAL_AND_HARDWARE_SOURCES,
  ...GAMING_SOURCES,
]);

export function sourceBySlug(slug: string) {
  return SOURCES.find((source) => source.slug === slug);
}

export function sourceById(id: string) {
  return SOURCES.find((source) => source.id === id);
}

void SOURCE_CATEGORIES;
