import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

test("keeps the editorial cover inside the extractable article body", async () => {
  const module = await import("../components/extractable-article-body").catch(() => ({
    ExtractableArticleBody: undefined,
  }));
  const markup = module.ExtractableArticleBody
    ? renderToStaticMarkup(
        createElement(module.ExtractableArticleBody, {
          articleHtml: "<p>Full technical article body.</p>",
          assetAccessId: "opaque-cover",
          title: "Rendering digital humans",
        }),
      )
    : "";

  const bodyPosition = markup.indexOf('class="reader-body"');
  const coverPosition = markup.indexOf('class="reader-cover"');
  const contentPosition = markup.indexOf('class="reader-content"');

  expect(bodyPosition).toBeGreaterThan(-1);
  expect(coverPosition).toBeGreaterThan(bodyPosition);
  expect(contentPosition).toBeGreaterThan(coverPosition);
  expect(markup).toContain("Full technical article body.");
  expect(markup).toContain("Editorial cover for Rendering digital humans");
});
