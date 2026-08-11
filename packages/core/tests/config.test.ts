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

  test("keeps Kindle delivery disabled unless explicitly enabled", () => {
    expect(parseRuntimeConfig(valid).kindleDelivery).toBeNull();
  });

  test("accepts a complete dedicated SES Kindle delivery configuration", () => {
    const config = parseRuntimeConfig({
      ...valid,
      KINDLE_DELIVERY_ENABLED: "true",
      KINDLE_DESTINATION_EMAIL: "reader_123@kindle.com",
      KINDLE_SENDER_EMAIL: "delivery@example.com",
      SES_REGION: "us-east-1",
      SES_ACCESS_KEY_ID: "ses-access",
      SES_SECRET_ACCESS_KEY: "ses-secret",
    });

    expect(config.kindleDelivery).toMatchObject({
      destinationEmail: "reader_123@kindle.com",
      senderEmail: "delivery@example.com",
      region: "us-east-1",
      accessKeyId: "ses-access",
    });
  });

  test("rejects incomplete Kindle delivery configuration", () => {
    expect(() => parseRuntimeConfig({ ...valid, KINDLE_DELIVERY_ENABLED: "true" })).toThrow(
      "Kindle delivery configuration",
    );
    expect(() =>
      parseRuntimeConfig({
        ...valid,
        KINDLE_DELIVERY_ENABLED: "true",
        KINDLE_DESTINATION_EMAIL: "reader@kindle.com",
        KINDLE_SENDER_EMAIL: "delivery@example.com",
        SES_REGION: "us-east-1",
        SES_ACCESS_KEY_ID: "access-only",
      }),
    ).toThrow("SES credentials");
  });
});
