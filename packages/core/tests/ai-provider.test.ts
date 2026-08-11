import { describe, expect, test, vi } from "vitest";

import {
  DeterministicAiProvider,
  OpenAiCompatibleProvider,
  type AiProvider,
} from "../src/ai-provider.js";

const article = {
  title: "Neural rendering systems in production",
  excerpt: "Architecture, benchmarks, algorithms, and implementation notes.",
  wordCount: 2_400,
  imageCount: 4,
  publishedAt: "2026-08-10T12:00:00.000Z",
};

describe("AI providers", () => {
  test("the deterministic provider scores and summarizes without credentials", async () => {
    const provider: AiProvider = new DeterministicAiProvider();
    const evaluation = await provider.evaluate(article);
    const summary = await provider.summarize({
      title: article.title,
      excerpt: article.excerpt,
      textContent:
        "This article explains a production neural rendering pipeline. It compares several architectures and includes benchmark results.",
    });

    expect(evaluation.total).toBeGreaterThan(70);
    expect(summary.length).toBeGreaterThan(20);
    expect(provider.generateImage).toBeUndefined();
  });

  test("the compatible provider validates structured evaluation output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  depth: 92,
                  originality: 83,
                  relevance: 96,
                  readability: 87,
                  visualValue: 70,
                  recency: 95,
                  penalties: [],
                  total: 90,
                  explanation: "A deep, original, highly relevant technical article.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://models.example.test/v1",
      apiKey: "test-only-key",
      model: "scoring-model",
      fetcher,
    });

    const evaluation = await provider.evaluate(article);

    expect(evaluation.total).toBe(90);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  test("rejects malformed or out-of-range provider output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"depth": 900}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://models.example.test/v1",
      apiKey: "test-only-key",
      model: "scoring-model",
      fetcher,
    });

    await expect(provider.evaluate(article)).rejects.toThrow("invalid structured output");
  });

  test("never places the provider credential in an error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("upstream detail", { status: 500 }));
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://models.example.test/v1",
      apiKey: "do-not-leak-this",
      model: "scoring-model",
      fetcher,
    });

    const error = await provider.evaluate(article).catch((caught: unknown) => caught);
    expect(String(error)).toContain("AI provider request failed (500)");
    expect(String(error)).not.toContain("do-not-leak-this");
    expect(String(error)).not.toContain("upstream detail");
  });
});
