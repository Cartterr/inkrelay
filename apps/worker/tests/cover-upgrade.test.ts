import { describe, expect, test, vi } from "vitest";

import { coverUpgradeArticleIds, enqueueCoverUpgradeJobs } from "../src/cover-upgrade.js";

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

  test("requeues legacy covers without stale singleton suppression", async () => {
    const send = vi.fn().mockResolvedValueOnce("job-1").mockResolvedValueOnce("job-2");

    await expect(enqueueCoverUpgradeJobs({ send }, ["article-1", "article-2"])).resolves.toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[2]).not.toHaveProperty("singletonKey");
  });
});
