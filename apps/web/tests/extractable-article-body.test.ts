import { Readability } from "@mozilla/readability";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { publicInlineAssetUrl } from "../lib/article-metadata";

test("keeps the editorial cover inside the content node KTool converts", async () => {
  const module = await import("../components/extractable-article-body").catch(() => ({
    ExtractableArticleBody: undefined,
  }));
  const markup = module.ExtractableArticleBody
    ? renderToStaticMarkup(
        createElement(module.ExtractableArticleBody, {
          articleHtml: "<p>Full technical article body.</p>",
          coverUrl: "https://inkrelay.example/assets/opaque-cover",
          heroCoverUrl: "https://inkrelay.example/assets/opaque-cover-hero",
          title: "Rendering digital humans",
        }),
      )
    : "";

  const coverPosition = markup.indexOf('class="reader-cover"');
  const articlePosition = markup.indexOf("Full technical article body.");

  expect(markup).toMatch(
    /<div class="reader-content"><div class="reader-article-content"><img(?=[^>]*class="reader-cover-sentinel")[^>]*><figure class="reader-cover-figure"><img(?=[^>]*class="reader-cover")[^>]*><figcaption class="reader-cover-caption">Editorial cover for Rendering digital humans<\/figcaption><\/figure><p>/u,
  );
  expect(articlePosition).toBeGreaterThan(coverPosition);
  expect(markup).toContain("Editorial cover for Rendering digital humans");
});

test("survives the Mozilla Readability pass KTool applies", async () => {
  const { ExtractableArticleBody } = await import("../components/extractable-article-body");
  const opening = "Full technical article body begins here.";
  const articleHtml = Array.from(
    { length: 12 },
    (_, index) =>
      `<p>${index === 0 ? opening : `Substantive engineering paragraph ${index}.`} ${"Detailed rendering analysis. ".repeat(16)}</p>`,
  ).join("");
  const markup = renderToStaticMarkup(
    createElement(ExtractableArticleBody, {
      articleHtml,
      coverUrl: publicInlineAssetUrl("opaque-cover", "https://inkrelay.example/"),
      heroCoverUrl: "https://inkrelay.example/assets/opaque-cover",
      title: "Rendering digital humans",
    }),
  );
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const sentinelCss = globalCss.match(/\.reader-cover-sentinel\s*\{[^}]*\}/u)?.[0] ?? "";
  expect(sentinelCss).not.toContain("display: none");
  const dom = new JSDOM(
    `<!doctype html><html><head><title>Rendering digital humans</title><style>${sentinelCss}</style></head><body><article>${markup}</article></body></html>`,
    {
      url: "https://inkrelay.example/a/opaque/rendering-digital-humans",
      pretendToBeVisual: true,
    },
  );

  const parsed = new Readability(dom.window.document).parse();
  const content = parsed?.content ?? "";

  expect(content).toContain("https://inkrelay.example/assets/opaque-cover?placement=article");
  expect(content.indexOf('src="https://inkrelay.example/assets/opaque-cover"')).toBeLessThan(
    content.indexOf('src="https://inkrelay.example/assets/opaque-cover?placement=article"'),
  );
  expect(
    content.indexOf("https://inkrelay.example/assets/opaque-cover?placement=article"),
  ).toBeLessThan(content.indexOf(opening));
});
