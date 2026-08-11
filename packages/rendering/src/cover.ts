import { createHash } from "node:crypto";

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

export function layoutCoverTitle(title: string): string[] {
  const words = title.trim().replace(/\s+/gu, " ").split(" ");
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
  visible[MAX_TITLE_LINES - 1] = `${last.slice(0, MAX_TITLE_LINE_LENGTH - 1).trimEnd()}…`;
  return visible;
}

export async function renderMonochromeCover(input: CoverInput): Promise<Buffer> {
  const background = input.sourceImage
    ? await sourceImageBackground(input.sourceImage)
    : fallbackBackground(input.category, input.title);
  const typography = Buffer.from(typographySvg(input), "utf8");

  return sharp(background)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .composite([{ input: typography, top: 0, left: 0 }])
    .greyscale()
    .normalise()
    .removeAlpha()
    .toColourspace("b-w")
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function sourceImageBackground(image: Buffer): Promise<Buffer> {
  return sharp(image, { failOn: "warning", limitInputPixels: 40_000_000 })
    .rotate()
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
    .greyscale()
    .normalise()
    .modulate({ brightness: 0.72, saturation: 0 })
    .blur(0.35)
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

function typographySvg(input: CoverInput): string {
  const lines = layoutCoverTitle(input.title);
  const titleText = lines
    .map(
      (line, index) =>
        `<text x="88" y="${720 + index * 112}" font-size="94" font-weight="800" letter-spacing="-2">${escapeSvg(line)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><style>text{font-family:Arial,Helvetica,sans-serif}</style><rect x="56" y="54" width="1088" height="96" fill="#fff"/><text x="88" y="120" font-size="42" font-weight="700" letter-spacing="5">${escapeSvg(input.editionLabel.toUpperCase())}</text><rect x="56" y="630" width="1088" height="${Math.max(720, lines.length * 118 + 200)}" fill="#fff" fill-opacity="0.94"/><text x="88" y="690" font-size="32" font-weight="700" letter-spacing="4">${escapeSvg(input.category.toUpperCase())}</text>${titleText}<text x="88" y="1510" font-size="38" font-weight="700">${escapeSvg(input.sourceName)}</text><line x1="88" y1="1540" x2="1112" y2="1540" stroke="#111" stroke-width="8"/></svg>`;
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
