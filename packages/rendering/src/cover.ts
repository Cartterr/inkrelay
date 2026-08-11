import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { SourceCategory } from "@inkrelay/core";
import sharp from "sharp";

export interface CoverInput {
  title: string;
  sourceName: string;
  category: SourceCategory;
  editionLabel: string;
  sourceImage?: Buffer;
}

const WIDTH = 1_200;
const HEIGHT = 1_600;
const MAX_TITLE_LINE_LENGTH = 24;
const MAX_TITLE_LINES = 6;
export const COVER_RENDERER_VERSION = "kindle-v2";

export function layoutCoverTitle(title: string): string[] {
  const safeTitle = kindleSafeText(title) || "UNTITLED";
  const words = safeTitle.trim().replace(/\s+/gu, " ").split(" ");
  const lines: string[] = [];
  let line = "";
  for (const rawWord of words) {
    const word =
      rawWord.length > MAX_TITLE_LINE_LENGTH ? rawWord.slice(0, MAX_TITLE_LINE_LENGTH) : rawWord;
    const proposed = line ? `${line} ${word}` : word;
    if (proposed.length <= MAX_TITLE_LINE_LENGTH) {
      line = proposed;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length <= MAX_TITLE_LINES) return lines;
  const visible = lines.slice(0, MAX_TITLE_LINES);
  const last = visible[MAX_TITLE_LINES - 1] ?? "";
  visible[MAX_TITLE_LINES - 1] = `${last.slice(0, MAX_TITLE_LINE_LENGTH - 3).trimEnd()}...`;
  return visible;
}

export async function renderMonochromeCover(input: CoverInput): Promise<Buffer> {
  const fontFile = bundledCoverFontPath();
  if (!existsSync(fontFile)) {
    throw new Error("Bundled InkRelay cover font is unavailable");
  }
  const background = input.sourceImage
    ? await sourceImageBackground(input.sourceImage)
    : fallbackBackground(input.category, input.title);
  const lines = layoutCoverTitle(input.title);
  const titleFontSize = lines.length <= 3 ? 94 : lines.length <= 4 ? 80 : 66;
  const frame = Buffer.from(frameSvg(), "utf8");
  const [editionText, categoryText, titleText, sourceText] = await Promise.all([
    renderText(kindleSafeText(input.editionLabel).toUpperCase(), 36, 990, 70, "700", fontFile),
    renderText(
      kindleSafeText(input.category).replace(/-/gu, " ").toUpperCase(),
      28,
      1_000,
      48,
      "700",
      fontFile,
    ),
    renderText(lines.join("\n"), titleFontSize, 1_020, 500, "800", fontFile, titleFontSize + 10),
    renderText(kindleSafeText(input.sourceName), 34, 1_000, 52, "700", fontFile),
  ]);

  return sharp(background)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .composite([
      { input: frame, top: 0, left: 0 },
      { input: editionText, left: 86, top: 82 },
      { input: categoryText, left: 86, top: 846 },
      { input: titleText, left: 86, top: 920 },
      { input: sourceText, left: 86, top: 1_500 },
    ])
    .greyscale()
    .normalise()
    .removeAlpha()
    .toColourspace("b-w")
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer();
}

async function sourceImageBackground(image: Buffer): Promise<Buffer> {
  return sharp(image, { failOn: "warning", limitInputPixels: 40_000_000 })
    .rotate()
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
    .greyscale()
    .normalise()
    .modulate({ brightness: 0.92, saturation: 0 })
    .sharpen({ sigma: 0.7 })
    .png()
    .toBuffer();
}

function fallbackBackground(category: SourceCategory, seed: string): Buffer {
  const digest = createHash("sha256").update(`${category}:${seed}`).digest();
  const bars = Array.from({ length: 14 }, (_, index) => {
    const byte = digest[index] ?? 0;
    const x = (index % 7) * 190 - 65;
    const y = Math.floor(index / 7) * 520 + 100 + (byte % 180);
    const height = 260 + ((digest[index + 8] ?? byte) % 340);
    const shade = 32 + (byte % 150);
    return `<rect x="${x}" y="${y}" width="150" height="${height}" fill="rgb(${shade},${shade},${shade})" transform="rotate(${(byte % 17) - 8} ${x + 75} ${y + height / 2})"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="1200" height="1600" fill="#e8e8e8"/><g opacity="0.82">${bars}</g><circle cx="980" cy="250" r="300" fill="none" stroke="#111" stroke-width="24"/><path d="M0 1170 L1200 830 L1200 1600 L0 1600 Z" fill="#111"/></svg>`;
  return Buffer.from(svg, "utf8");
}

function frameSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect x="56" y="54" width="1088" height="118" fill="#050505"/><rect x="0" y="790" width="1200" height="810" fill="#050505"/><line x1="86" y1="1458" x2="1114" y2="1458" stroke="#fff" stroke-width="4"/><rect x="24" y="24" width="1152" height="1552" fill="none" stroke="#111" stroke-width="12"/></svg>`;
}

async function renderText(
  text: string,
  fontSize: number,
  width: number,
  height: number,
  weight: "700" | "800",
  fontFile: string,
  spacing?: number,
): Promise<Buffer> {
  const rendered = await sharp({
    text: {
      text: `<span foreground="#ffffff" weight="${weight}">${escapePango(text)}</span>`,
      font: `Inter ${fontSize}`,
      fontfile: fontFile,
      width,
      align: "left" as const,
      rgba: true,
      dpi: 72,
      spacing,
      wrap: "none" as const,
    },
  })
    .png()
    .toBuffer();
  return sharp(rendered)
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

function bundledCoverFontPath(): string {
  return fileURLToPath(new URL("../assets/fonts/Inter-Variable.ttf", import.meta.url));
}

function kindleSafeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/\u2026/gu, "...")
    .replace(/\u00a0/gu, " ")
    .replace(/[^\x20-\x7e]/gu, "?")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapePango(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
