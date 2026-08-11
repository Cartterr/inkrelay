import { fetchTextSafely } from "@inkrelay/core";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const DEFAULT_MAX_IMAGES = 10;
const DEFAULT_MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_OUTPUT_IMAGE_BYTES = 900 * 1024;

export interface EmbeddedArticleImage {
  sourceUrl: string;
  bytes: Buffer;
  mediaType: "image/jpeg";
  width: number;
  height: number;
  alt: string;
}

export interface PreparedArticleImages {
  images: EmbeddedArticleImage[];
  discoveredCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface ArticleImageResponse {
  bytes: Uint8Array;
  contentType: string | null;
}

export interface PrepareArticleImagesOptions {
  maxImages?: number;
  maxTotalBytes?: number;
  fetchImage?: (url: string) => Promise<ArticleImageResponse>;
}

interface ImageCandidate {
  sourceUrl: string;
  alt: string;
}

export async function prepareArticleImages(
  contentHtml: string,
  baseUrl: string,
  options: PrepareArticleImagesOptions = {},
): Promise<PreparedArticleImages> {
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const fetchImage = options.fetchImage ?? defaultImageFetcher;
  const candidates = collectImageCandidates(contentHtml, baseUrl);
  const attempted = candidates.slice(0, maxImages);
  const normalized = await mapWithConcurrency(attempted, 3, async (candidate) => {
    try {
      const response = await fetchImage(candidate.sourceUrl);
      if (!isRasterContentType(response.contentType)) return null;
      return await normalizeArticleImage(candidate, Buffer.from(response.bytes));
    } catch {
      return null;
    }
  });

  const images: EmbeddedArticleImage[] = [];
  let totalBytes = 0;
  let failedCount = 0;
  let skippedForBudget = 0;
  for (const image of normalized) {
    if (!image) {
      failedCount += 1;
      continue;
    }
    if (totalBytes + image.bytes.length > maxTotalBytes) {
      skippedForBudget += 1;
      continue;
    }
    images.push(image);
    totalBytes += image.bytes.length;
  }

  return {
    images,
    discoveredCount: candidates.length,
    failedCount,
    skippedCount: Math.max(0, candidates.length - attempted.length) + skippedForBudget,
  };
}

export function selectArticleImageUrl(
  attributes: { src?: string | null; srcset?: string | null },
  baseUrl: string,
): string | null {
  const srcsetCandidates = parseSrcset(attributes.srcset ?? "");
  const candidate = srcsetCandidates.at(-1)?.url ?? attributes.src?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate, baseUrl);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function collectImageCandidates(contentHtml: string, baseUrl: string): ImageCandidate[] {
  const dom = new JSDOM(`<body>${contentHtml}</body>`);
  const seen = new Set<string>();
  const candidates: ImageCandidate[] = [];
  for (const [index, image] of Array.from(dom.window.document.querySelectorAll("img")).entries()) {
    const sourceUrl = selectArticleImageUrl(
      { src: image.getAttribute("src"), srcset: image.getAttribute("srcset") },
      baseUrl,
    );
    if (!sourceUrl || seen.has(sourceUrl) || isDeclaredTinyImage(image)) continue;
    seen.add(sourceUrl);
    candidates.push({
      sourceUrl,
      alt:
        image.getAttribute("alt")?.trim() ||
        image.getAttribute("title")?.trim() ||
        `Article illustration ${index + 1}`,
    });
  }
  return candidates;
}

function parseSrcset(value: string): Array<{ url: string; score: number }> {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [url = "", descriptor = ""] = part.split(/\s+/u);
      const numeric = Number.parseFloat(descriptor.replace(/[wx]$/u, ""));
      return { url, score: Number.isFinite(numeric) ? numeric : index + 1 };
    })
    .filter((candidate) => candidate.url.length > 0)
    .sort((left, right) => left.score - right.score);
}

function isDeclaredTinyImage(image: Element): boolean {
  const width = Number.parseInt(image.getAttribute("width") ?? "", 10);
  const height = Number.parseInt(image.getAttribute("height") ?? "", 10);
  return Number.isFinite(width) && Number.isFinite(height) && width <= 80 && height <= 80;
}

async function defaultImageFetcher(url: string): Promise<ArticleImageResponse> {
  const response = await fetchTextSafely(url, {
    headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8" },
    maxBytes: MAX_SOURCE_IMAGE_BYTES,
    timeoutMs: 15_000,
  });
  return { bytes: response.bytes, contentType: response.contentType };
}

function isRasterContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
  return Boolean(normalized?.startsWith("image/") && normalized !== "image/svg+xml");
}

async function normalizeArticleImage(
  candidate: ImageCandidate,
  source: Buffer,
): Promise<EmbeddedArticleImage | null> {
  const pipeline = sharp(source, {
    animated: false,
    failOn: "warning",
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 1_100, height: 1_450, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .toColourspace("b-w")
    .normalize()
    .sharpen({ sigma: 0.6 });
  let result = await pipeline
    .clone()
    .jpeg({ quality: 82, progressive: false, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });
  if (
    result.info.width < 160 ||
    result.info.height < 100 ||
    result.info.width * result.info.height < 40_000
  ) {
    return null;
  }
  if (result.data.length > MAX_OUTPUT_IMAGE_BYTES) {
    result = await pipeline
      .clone()
      .resize({ width: 900, height: 1_250, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70, progressive: false, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });
  }
  if (result.data.length > MAX_OUTPUT_IMAGE_BYTES) return null;
  return {
    sourceUrl: candidate.sourceUrl,
    bytes: result.data,
    mediaType: "image/jpeg",
    width: result.info.width,
    height: result.info.height,
    alt: candidate.alt.slice(0, 300),
  };
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
