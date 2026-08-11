import { expect, test } from "vitest";

test("hashes opaque article and user-agent identifiers before logging", async () => {
  const module = await import("../lib/article-request-log").catch(() => ({
    buildArticleRequestLog: undefined,
  }));

  const event = module.buildArticleRequestLog?.("opaque-article", "KToolReader/1.0");

  expect(event).toEqual({
    event: "article.render",
    route: "article",
    articleHash: "dWURAQ7GizrB1Ve5Z7VbkHRNclGLNC0yLY5Bgi8P8pA",
    userAgentHash: "hp5QPvUf5DZymN0-1zqV3O2i1HE7lP_QZ9xaFoBbbRE",
    userAgentClass: "ktool",
  });
  expect(JSON.stringify(event)).not.toContain("opaque-article");
  expect(JSON.stringify(event)).not.toContain("KToolReader/1.0");
});
