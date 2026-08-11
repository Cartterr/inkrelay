import { z } from "zod";

import {
  evaluateDeterministically,
  type ArticleEvaluation,
  type DeterministicEvaluationInput,
} from "./curation.js";

export interface SummaryInput {
  title: string;
  excerpt: string | null;
  textContent: string;
}

export interface ImageGenerationInput {
  title: string;
  category: string;
  prompt: string;
}

export interface GeneratedImage {
  bytes: Uint8Array;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
}

export interface AiProvider {
  evaluate(input: DeterministicEvaluationInput): Promise<ArticleEvaluation>;
  summarize(input: SummaryInput): Promise<string>;
  generateImage?(input: ImageGenerationInput): Promise<GeneratedImage>;
}

export class DeterministicAiProvider implements AiProvider {
  async evaluate(input: DeterministicEvaluationInput): Promise<ArticleEvaluation> {
    return evaluateDeterministically(input);
  }

  async summarize(input: SummaryInput): Promise<string> {
    const source = input.excerpt?.trim() || input.textContent.trim();
    const normalized = source.replace(/\s+/gu, " ");
    if (!normalized) return `${input.title} is queued for the weekly technical reading edition.`;
    const sentence =
      normalized.match(/^.{1,360}?(?:[.!?](?:\s|$)|$)/u)?.[0] ?? normalized.slice(0, 360);
    return sentence.trim();
  }
}

const evaluationSchema = z.object({
  depth: z.number().int().min(0).max(100),
  originality: z.number().int().min(0).max(100),
  relevance: z.number().int().min(0).max(100),
  readability: z.number().int().min(0).max(100),
  visualValue: z.number().int().min(0).max(100),
  recency: z.number().int().min(0).max(100),
  penalties: z.array(z.string().max(100)).max(12),
  total: z.number().int().min(0).max(100),
  explanation: z.string().min(1).max(1_000),
});

const chatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
});

export interface OpenAiCompatibleProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetcher: typeof fetch;

  constructor(options: OpenAiCompatibleProviderOptions) {
    const baseUrl = new URL(options.baseUrl);
    if (baseUrl.protocol !== "https:") throw new Error("AI provider base URL must use HTTPS");
    if (!options.apiKey || !options.model)
      throw new Error("AI provider configuration is incomplete");
    this.#baseUrl = baseUrl.toString().replace(/\/$/u, "");
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#fetcher = options.fetcher ?? fetch;
  }

  async evaluate(input: DeterministicEvaluationInput): Promise<ArticleEvaluation> {
    const content = await this.#chat(
      "Evaluate this technical-reading candidate. Return only JSON with integer 0-100 fields depth, originality, relevance, readability, visualValue, recency, total; a penalties string array; and a concise explanation.",
      JSON.stringify(input),
      true,
    );
    try {
      return evaluationSchema.parse(JSON.parse(content));
    } catch {
      throw new Error("AI provider returned invalid structured output");
    }
  }

  async summarize(input: SummaryInput): Promise<string> {
    const content = await this.#chat(
      "Write a factual two-sentence summary for a technical weekly reader. Do not add claims absent from the supplied text.",
      JSON.stringify(input),
      false,
    );
    const summary = content.replace(/\s+/gu, " ").trim();
    if (!summary || summary.length > 1_200)
      throw new Error("AI provider returned invalid summary output");
    return summary;
  }

  async #chat(system: string, user: string, jsonMode: boolean): Promise<string> {
    const response = await this.#fetcher(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) throw new Error(`AI provider request failed (${response.status})`);

    const parsed = chatResponseSchema.safeParse(await response.json());
    const content = parsed.success ? parsed.data.choices[0]?.message.content : undefined;
    if (!content) throw new Error("AI provider returned an invalid response envelope");
    return content;
  }
}
