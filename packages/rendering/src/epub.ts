import { strToU8, zipSync, type Zippable } from "fflate";
import { JSDOM } from "jsdom";
import sharp from "sharp";

import { selectArticleImageUrl, type EmbeddedArticleImage } from "./article-images.js";

export interface WeeklyEpubEntry {
  articleId: string;
  title: string;
  sourceName: string;
  summary: string;
  contentHtml: string;
  originalUrl: string;
  publishedAt: string;
  coverPng: Buffer;
  inlineImages?: EmbeddedArticleImage[];
}

export interface WeeklyEpubInput {
  editionId: string;
  title: string;
  publishedAt: string;
  entries: WeeklyEpubEntry[];
}

export interface ArticleEpubInput {
  editionId: string;
  entry: WeeklyEpubEntry;
}

const ZIP_EPOCH = new Date("2000-01-01T00:00:00.000Z");
export const MAX_KTOOL_EPUB_BYTES = 20 * 1024 * 1024;
const MAX_EPUB_INPUT_BYTES = 30 * 1024 * 1024;

export class WeeklyEpubValidationError extends Error {
  override readonly name = "WeeklyEpubValidationError";
}

export async function renderWeeklyEpub(input: WeeklyEpubInput): Promise<Buffer> {
  assertCompleteEdition(input.entries);
  return renderEpub(input);
}

export async function renderArticleEpub(input: ArticleEpubInput): Promise<Buffer> {
  assertEntriesValid([input.entry]);
  return renderEpub({
    editionId: `${input.editionId}:${input.entry.articleId}`,
    title: input.entry.title,
    publishedAt: input.entry.publishedAt,
    entries: [input.entry],
  });
}

async function renderEpub(input: WeeklyEpubInput): Promise<Buffer> {
  const normalizedInput = {
    ...input,
    entries: await normalizeCovers(input.entries),
  };
  const files: Zippable = {};
  files.mimetype = [strToU8("application/epub+zip"), { level: 0, mtime: ZIP_EPOCH }];
  files["META-INF/container.xml"] = textFile(containerXml());
  files["OEBPS/content.opf"] = textFile(contentOpf(normalizedInput));
  files["OEBPS/nav.xhtml"] = textFile(navXhtml(normalizedInput));
  files["OEBPS/toc.ncx"] = textFile(tocNcx(normalizedInput));
  files["OEBPS/cover.xhtml"] = textFile(coverXhtml(normalizedInput.title));

  normalizedInput.entries.forEach((entry, index) => {
    const number = articleNumber(index);
    files[`OEBPS/article-${number}.xhtml`] = textFile(articleXhtml(entry, number));
    files[`OEBPS/images/article-${number}-cover.png`] = binaryFile(entry.coverPng);
    entry.inlineImages?.forEach((image, imageIndex) => {
      files[`OEBPS/${inlineImagePath(number, imageIndex)}`] = binaryFile(image.bytes);
    });
  });

  const epub = Buffer.from(zipSync(files, { level: 6, mtime: ZIP_EPOCH }));
  if (epub.length > MAX_KTOOL_EPUB_BYTES) {
    throw new WeeklyEpubValidationError("Weekly EPUB exceeds KTool's 20 MB upload limit");
  }
  return epub;
}

function assertCompleteEdition(entries: WeeklyEpubEntry[]): void {
  if (entries.length !== 10) {
    throw new WeeklyEpubValidationError("A weekly EPUB requires exactly 10 entries");
  }
  const sources = new Set(entries.map((entry) => entry.sourceName.trim().toLocaleLowerCase("en")));
  if (sources.size !== 10) {
    throw new WeeklyEpubValidationError("A weekly EPUB requires 10 distinct sources");
  }
  assertEntriesValid(entries);
}

function assertEntriesValid(entries: WeeklyEpubEntry[]): void {
  if (entries.some((entry) => entry.contentHtml.trim().length === 0)) {
    throw new WeeklyEpubValidationError("Every weekly EPUB entry requires article content");
  }
  const inputBytes = entries.reduce(
    (total, entry) =>
      total +
      entry.coverPng.length +
      Buffer.byteLength(entry.contentHtml, "utf8") +
      (entry.inlineImages ?? []).reduce((imageTotal, image) => imageTotal + image.bytes.length, 0),
    0,
  );
  if (inputBytes > MAX_EPUB_INPUT_BYTES) {
    throw new WeeklyEpubValidationError("Weekly EPUB inputs exceed the safe processing limit");
  }
}

async function normalizeCovers(entries: WeeklyEpubEntry[]): Promise<WeeklyEpubEntry[]> {
  const normalized: WeeklyEpubEntry[] = [];
  for (const entry of entries) {
    normalized.push({ ...entry, coverPng: await normalizePngCover(entry.coverPng) });
  }
  return normalized;
}

async function normalizePngCover(cover: Buffer): Promise<Buffer> {
  const hasPngSignature =
    cover.length >= 24 &&
    cover.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!hasPngSignature) throw invalidCoverError();
  try {
    const { data, info } = await sharp(cover, {
      failOn: "error",
      limitInputPixels: 1_920_000,
    })
      .greyscale()
      .removeAlpha()
      .toColourspace("b-w")
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true });
    if (info.width !== 1_200 || info.height !== 1_600 || info.format !== "png") {
      throw invalidCoverError();
    }
    return data;
  } catch (error) {
    if (error instanceof WeeklyEpubValidationError) throw error;
    throw invalidCoverError();
  }
}

function invalidCoverError(): WeeklyEpubValidationError {
  return new WeeklyEpubValidationError("Every weekly EPUB cover must be a valid 1200 by 1600 PNG");
}

function textFile(value: string): [Uint8Array, { level: 6; mtime: Date }] {
  return [strToU8(value), { level: 6, mtime: ZIP_EPOCH }];
}

function binaryFile(value: Buffer): [Uint8Array, { level: 6; mtime: Date }] {
  return [new Uint8Array(value), { level: 6, mtime: ZIP_EPOCH }];
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
}

function contentOpf(input: WeeklyEpubInput): string {
  const modified = new Date(input.publishedAt).toISOString().replace(/\.\d{3}Z$/u, "Z");
  const articleManifest = input.entries
    .map((entry, index) => {
      const number = articleNumber(index);
      const coverItem =
        index === 0
          ? ""
          : `\n    <item id="article-${number}-cover" href="images/article-${number}-cover.png" media-type="image/png"/>`;
      const imageItems = (entry.inlineImages ?? [])
        .map(
          (image, imageIndex) =>
            `\n    <item id="article-${number}-image-${imageIndex + 1}" href="${inlineImagePath(number, imageIndex)}" media-type="${image.mediaType}"/>`,
        )
        .join("");
      return `    <item id="article-${number}" href="article-${number}.xhtml" media-type="application/xhtml+xml"/>${coverItem}${imageItems}`;
    })
    .join("\n");
  const spine = input.entries
    .map((_, index) => `    <itemref idref="article-${articleNumber(index)}"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:inkrelay:${escapeXml(input.editionId)}</dc:identifier>
    <dc:title>${escapeXml(input.title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:publisher>InkRelay</dc:publisher>
    <dc:date>${escapeXml(input.publishedAt)}</dc:date>
    <meta property="dcterms:modified">${modified}</meta>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-image" href="images/article-01-cover.png" media-type="image/png" properties="cover-image"/>
${articleManifest}
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover-page"/>
${spine}
  </spine>
</package>`;
}

function navXhtml(input: WeeklyEpubInput): string {
  const items = input.entries
    .map(
      (entry, index) =>
        `        <li><a href="article-${articleNumber(index)}.xhtml">${escapeXml(entry.title)}</a></li>`,
    )
    .join("\n");
  return xhtmlDocument(
    "Contents",
    `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\n${items}\n      </ol></nav>`,
  );
}

function tocNcx(input: WeeklyEpubInput): string {
  const points = input.entries
    .map(
      (entry, index) => `    <navPoint id="nav-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(entry.title)}</text></navLabel>
      <content src="article-${articleNumber(index)}.xhtml"/>
    </navPoint>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:inkrelay:${escapeXml(input.editionId)}"/></head>
  <docTitle><text>${escapeXml(input.title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>`;
}

function coverXhtml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <style>
    body { margin: 0; padding: 0; text-align: center; }
    section { margin: 0; padding: 0; }
    img { display: block; width: 100%; height: auto; }
  </style>
</head>
<body><section epub:type="cover"><img src="images/article-01-cover.png" alt="${escapeXml(title)} cover"/></section></body>
</html>`;
}

function articleXhtml(entry: WeeklyEpubEntry, number: string): string {
  const articleContent = contentHtmlToXhtml(entry, number);
  const body = `<article>
  <img class="article-cover" src="images/article-${number}-cover.png" alt="Editorial cover for ${escapeXml(entry.title)}"/>
  <p class="source">${escapeXml(entry.sourceName)}</p>
  <h1>${escapeXml(entry.title)}</h1>
  <p class="summary">${escapeXml(entry.summary)}</p>
  ${articleContent}
  <p class="original"><a href="${escapeXml(entry.originalUrl)}">Read the original article</a></p>
</article>`;
  return xhtmlDocument(entry.title, body);
}

function contentHtmlToXhtml(entry: WeeklyEpubEntry, number: string): string {
  const dom = new JSDOM(`<body>${entry.contentHtml}</body>`);
  const { document, XMLSerializer } = dom.window;
  document.querySelectorAll("picture").forEach((picture) => {
    const image = picture.querySelector("img");
    if (image) picture.replaceWith(image);
    else picture.remove();
  });
  document.querySelectorAll("source").forEach((source) => {
    source.remove();
  });
  const imageIndexBySource = new Map(
    (entry.inlineImages ?? []).map((image, imageIndex) => [image.sourceUrl, imageIndex] as const),
  );
  document.querySelectorAll("img").forEach((image) => {
    const sourceUrl = selectArticleImageUrl(
      { src: image.getAttribute("src"), srcset: image.getAttribute("srcset") },
      entry.originalUrl,
    );
    const imageIndex = sourceUrl ? imageIndexBySource.get(sourceUrl) : undefined;
    if (imageIndex === undefined) {
      image.remove();
      return;
    }
    const embedded = entry.inlineImages?.[imageIndex];
    image.setAttribute("src", inlineImagePath(number, imageIndex));
    image.setAttribute(
      "alt",
      image.getAttribute("alt")?.trim() || embedded?.alt || "Article image",
    );
    image.setAttribute("class", "inline-image");
    image.removeAttribute("srcset");
    image.removeAttribute("width");
    image.removeAttribute("height");
  });
  document
    .querySelectorAll(
      "script,style,iframe,object,embed,form,input,button,svg,math,video,audio,canvas",
    )
    .forEach((element) => {
      element.remove();
    });
  document.querySelectorAll("*").forEach((element) => {
    const allowed =
      element.tagName === "A"
        ? new Set(["href", "title"])
        : element.tagName === "IMG"
          ? new Set(["src", "alt", "title", "class"])
          : element.tagName === "TD" || element.tagName === "TH"
            ? new Set(["colspan", "rowspan", "scope"])
            : new Set<string>();
    for (const attribute of Array.from(element.attributes)) {
      if (!allowed.has(attribute.name.toLocaleLowerCase("en"))) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === "A") {
      const href = element.getAttribute("href");
      if (href && !/^https?:\/\//iu.test(href)) element.removeAttribute("href");
    }
  });
  document.querySelectorAll("figure").forEach((figure) => {
    if (!figure.querySelector("img") && figure.querySelector("figcaption")) figure.remove();
    else if (!figure.textContent?.trim() && !figure.querySelector("img")) figure.remove();
  });
  const serializer = new XMLSerializer();
  return Array.from(document.body.childNodes)
    .map((node) =>
      serializer
        .serializeToString(node)
        .replace(/\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/gu, ""),
    )
    .join("\n");
}

function xhtmlDocument(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <style>
    body { font-family: serif; line-height: 1.55; margin: 5%; }
    .cover { margin: 0; padding: 0; text-align: center; }
    .cover img, .article-cover { display: block; width: 100%; height: auto; page-break-after: always; }
    .source { font-family: sans-serif; font-size: 0.75em; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; }
    .summary { font-style: italic; }
    .original { border-top: 1px solid #777; margin-top: 2em; padding-top: 1em; }
    figure { margin: 1.5em 0; page-break-inside: avoid; }
    figcaption { color: #444; font-family: sans-serif; font-size: 0.8em; margin-top: 0.4em; text-align: center; }
    .inline-image { display: block; height: auto; margin: 1.25em auto; max-width: 100%; page-break-inside: avoid; }
    pre, table { max-width: 100%; overflow-wrap: anywhere; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function articleNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function inlineImagePath(article: string, imageIndex: number): string {
  return `images/article-${article}-inline-${String(imageIndex + 1).padStart(2, "0")}.jpg`;
}

function escapeXml(value: string): string {
  const xmlSafe = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint !== 0x7f && !(codePoint >= 0xd800 && codePoint <= 0xdfff))
      );
    })
    .join("");
  return xmlSafe
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
