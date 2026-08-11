import { strToU8, zipSync, type Zippable } from "fflate";

export interface WeeklyEpubEntry {
  articleId: string;
  title: string;
  sourceName: string;
  summary: string;
  textContent: string;
  originalUrl: string;
  publishedAt: string;
  coverPng: Buffer;
}

export interface WeeklyEpubInput {
  editionId: string;
  title: string;
  publishedAt: string;
  entries: WeeklyEpubEntry[];
}

const ZIP_EPOCH = new Date("2000-01-01T00:00:00.000Z");

export function renderWeeklyEpub(input: WeeklyEpubInput): Buffer {
  assertCompleteEdition(input.entries);
  const files: Zippable = {};
  files.mimetype = [strToU8("application/epub+zip"), { level: 0, mtime: ZIP_EPOCH }];
  files["META-INF/container.xml"] = textFile(containerXml());
  files["OEBPS/content.opf"] = textFile(contentOpf(input));
  files["OEBPS/nav.xhtml"] = textFile(navXhtml(input));
  files["OEBPS/toc.ncx"] = textFile(tocNcx(input));
  files["OEBPS/cover.xhtml"] = textFile(coverXhtml(input.title));
  files["OEBPS/images/cover.png"] = binaryFile(input.entries[0]?.coverPng ?? Buffer.alloc(0));

  input.entries.forEach((entry, index) => {
    const number = articleNumber(index);
    files[`OEBPS/article-${number}.xhtml`] = textFile(articleXhtml(entry, number));
    files[`OEBPS/images/article-${number}-cover.png`] = binaryFile(entry.coverPng);
  });

  return Buffer.from(zipSync(files, { level: 6, mtime: ZIP_EPOCH }));
}

function assertCompleteEdition(entries: WeeklyEpubEntry[]): void {
  if (entries.length !== 10) throw new Error("A weekly EPUB requires exactly 10 entries");
  const sources = new Set(entries.map((entry) => entry.sourceName.trim().toLocaleLowerCase("en")));
  if (sources.size !== 10) throw new Error("A weekly EPUB requires 10 distinct sources");
  if (entries.some((entry) => entry.coverPng.length === 0)) {
    throw new Error("Every weekly EPUB entry requires a cover image");
  }
  if (entries.some((entry) => entry.textContent.trim().length === 0)) {
    throw new Error("Every weekly EPUB entry requires article text");
  }
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
    .map((_, index) => {
      const number = articleNumber(index);
      return `    <item id="article-${number}" href="article-${number}.xhtml" media-type="application/xhtml+xml"/>\n    <item id="article-${number}-cover" href="images/article-${number}-cover.png" media-type="image/png"/>`;
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
    <item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>
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
  return xhtmlDocument(
    title,
    `<section class="cover" epub:type="cover"><img src="images/cover.png" alt="${escapeXml(title)} cover"/></section>`,
  );
}

function articleXhtml(entry: WeeklyEpubEntry, number: string): string {
  const paragraphs = entry.textContent
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeXml(paragraph).replace(/\n/gu, "<br/>")}</p>`)
    .join("\n");
  const body = `<article>
  <img class="article-cover" src="images/article-${number}-cover.png" alt="Editorial cover for ${escapeXml(entry.title)}"/>
  <p class="source">${escapeXml(entry.sourceName)}</p>
  <h1>${escapeXml(entry.title)}</h1>
  <p class="summary">${escapeXml(entry.summary)}</p>
  ${paragraphs}
  <p class="original"><a href="${escapeXml(entry.originalUrl)}">Read the original article</a></p>
</article>`;
  return xhtmlDocument(entry.title, body);
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
  </style>
</head>
<body>${body}</body>
</html>`;
}

function articleNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
