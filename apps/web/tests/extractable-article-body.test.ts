import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

test("keeps the editorial cover inside the content node KTool converts", async () => {
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

  const coverPosition = markup.indexOf('class="reader-cover"');
  const articlePosition = markup.indexOf("Full technical article body.");

  expect(markup).toMatch(
    /<div class="reader-content"><img(?=[^>]*class="reader-cover")[^>]*><div class="reader-article-content">/u,
  );
  expect(articlePosition).toBeGreaterThan(coverPosition);
  expect(markup).toContain("Editorial cover for Rendering digital humans");
});
