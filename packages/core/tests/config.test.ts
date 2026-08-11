import { describe, expect, test } from "vitest";

import { parseRuntimeConfig } from "../src/config.js";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.example.test:5432/inkrelay",
  PUBLIC_BASE_URL: "https://inkrelay.example",
  FEED_ACCESS_KEY: Buffer.alloc(32, 7).toString("base64url"),
  ALLOWED_GITHUB_LOGIN: "Cartterr",
  AWS_ENDPOINT_URL: "https://storage.example.test",
  AWS_ACCESS_KEY_ID: "access",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_S3_BUCKET_NAME: "inkrelay-covers",
  AWS_DEFAULT_REGION: "auto",
};

describe("runtime configuration", () => {
  test("accepts a complete credential-free-AI production configuration", () => {
    const config = parseRuntimeConfig(valid);
    expect(config.allowedGithubLogin).toBe("Cartterr");
    expect(config.aiText).toBeNull();
    expect(config.feedAccessKey).toBe(valid.FEED_ACCESS_KEY);
    expect(config.storage.forcePathStyle).toBe(false);
  });

  test("rejects a short feed key and non-HTTPS public origins in production", () => {
    expect(() => parseRuntimeConfig({ ...valid, FEED_ACCESS_KEY: "short" })).toThrow("256-bit");
    expect(() =>
      parseRuntimeConfig({ ...valid, PUBLIC_BASE_URL: "http://inkrelay.example" }),
    ).toThrow("HTTPS");
  });

  test("requires complete AI provider groups when any AI setting is present", () => {
    expect(() => parseRuntimeConfig({ ...valid, AI_TEXT_API_KEY: "key" })).toThrow(
      "AI text provider",
    );
  });
});
