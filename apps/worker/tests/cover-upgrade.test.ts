import { describe, expect, test } from "vitest";

import { coverUpgradeArticleIds } from "../src/cover-upgrade.js";

describe("cover renderer upgrades", () => {
  test("queues each legacy cover once and skips current renderer output", () => {
    expect(
      coverUpgradeArticleIds([
        { articleId: "article-1", coverGenerationSource: "source-image" },
        { articleId: "article-1", coverGenerationSource: "deterministic-fallback" },
        { articleId: "article-2", coverGenerationSource: "source-image:kindle-v2" },
        { articleId: "article-3", coverGenerationSource: "deterministic-fallback:kindle-v2" },
        { articleId: "article-4", coverGenerationSource: null },
      ]),
    ).toEqual(["article-1", "article-4"]);
  });
});
