import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url(),
  FEED_ACCESS_KEY: z.string().min(1),
  ALLOWED_GITHUB_LOGIN: z.string().min(1).default("Cartterr"),
  AUTH_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  AI_TEXT_BASE_URL: z.string().url().optional(),
  AI_TEXT_API_KEY: z.string().optional(),
  AI_TEXT_MODEL: z.string().optional(),
  AI_IMAGE_BASE_URL: z.string().url().optional(),
  AI_IMAGE_API_KEY: z.string().optional(),
  AI_IMAGE_MODEL: z.string().optional(),
  AWS_ENDPOINT_URL: z.string().url(),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_BUCKET_NAME: z.string().min(1),
  AWS_DEFAULT_REGION: z.string().min(1).default("auto"),
  AWS_S3_URL_STYLE: z.enum(["virtual", "path"]).default("virtual"),
  KINDLE_DELIVERY_ENABLED: z.enum(["true", "false"]).default("false"),
  KINDLE_DESTINATION_EMAIL: z.string().email().optional(),
  KINDLE_SENDER_EMAIL: z.string().email().optional(),
  SES_REGION: z.string().min(1).optional(),
  SES_ACCESS_KEY_ID: z.string().min(1).optional(),
  SES_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  SES_ENDPOINT_URL: z.string().url().optional(),
  SES_CONFIGURATION_SET: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface RuntimeConfig {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  publicBaseUrl: string;
  feedAccessKey: string;
  allowedGithubLogin: string;
  auth: { secret: string; githubId: string; githubSecret: string } | null;
  aiText: ProviderConfig | null;
  aiImage: ProviderConfig | null;
  storage: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
    forcePathStyle: boolean;
  };
  kindleDelivery: {
    destinationEmail: string;
    senderEmail: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    configurationSet?: string;
  } | null;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function parseRuntimeConfig(environment: Record<string, string | undefined>): RuntimeConfig {
  const parsed = environmentSchema.parse(environment);
  if (Buffer.from(parsed.FEED_ACCESS_KEY, "base64url").length !== 32) {
    throw new Error("FEED_ACCESS_KEY must contain exactly 256-bit entropy");
  }
  const publicBaseUrl = new URL(parsed.PUBLIC_BASE_URL);
  if (parsed.NODE_ENV === "production" && publicBaseUrl.protocol !== "https:") {
    throw new Error("PUBLIC_BASE_URL must use HTTPS in production");
  }
  const kindleDelivery = parseKindleDelivery(parsed);

  return {
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    publicBaseUrl: publicBaseUrl.toString().replace(/\/$/u, ""),
    feedAccessKey: parsed.FEED_ACCESS_KEY,
    allowedGithubLogin: parsed.ALLOWED_GITHUB_LOGIN,
    auth: optionalGroup(
      "Auth.js",
      [parsed.AUTH_SECRET, parsed.AUTH_GITHUB_ID, parsed.AUTH_GITHUB_SECRET],
      (secret, githubId, githubSecret) => ({ secret, githubId, githubSecret }),
    ),
    aiText: optionalGroup(
      "AI text provider",
      [parsed.AI_TEXT_BASE_URL, parsed.AI_TEXT_API_KEY, parsed.AI_TEXT_MODEL],
      (baseUrl, apiKey, model) => ({ baseUrl, apiKey, model }),
    ),
    aiImage: optionalGroup(
      "AI image provider",
      [parsed.AI_IMAGE_BASE_URL, parsed.AI_IMAGE_API_KEY, parsed.AI_IMAGE_MODEL],
      (baseUrl, apiKey, model) => ({ baseUrl, apiKey, model }),
    ),
    storage: {
      endpoint: parsed.AWS_ENDPOINT_URL,
      accessKeyId: parsed.AWS_ACCESS_KEY_ID,
      secretAccessKey: parsed.AWS_SECRET_ACCESS_KEY,
      bucket: parsed.AWS_S3_BUCKET_NAME,
      region: parsed.AWS_DEFAULT_REGION,
      forcePathStyle: parsed.AWS_S3_URL_STYLE === "path",
    },
    kindleDelivery,
    logLevel: parsed.LOG_LEVEL,
  };
}

function parseKindleDelivery(
  parsed: z.infer<typeof environmentSchema>,
): RuntimeConfig["kindleDelivery"] {
  if (parsed.KINDLE_DELIVERY_ENABLED !== "true") return null;
  if (!parsed.KINDLE_DESTINATION_EMAIL || !parsed.KINDLE_SENDER_EMAIL || !parsed.SES_REGION) {
    throw new Error(
      "Kindle delivery configuration must include destination, sender, and SES region",
    );
  }
  const hasAccessKey = Boolean(parsed.SES_ACCESS_KEY_ID);
  const hasSecretKey = Boolean(parsed.SES_SECRET_ACCESS_KEY);
  if (hasAccessKey !== hasSecretKey) {
    throw new Error("SES credentials must include both access key ID and secret access key");
  }
  return {
    destinationEmail: parsed.KINDLE_DESTINATION_EMAIL,
    senderEmail: parsed.KINDLE_SENDER_EMAIL,
    region: parsed.SES_REGION,
    ...(parsed.SES_ACCESS_KEY_ID && parsed.SES_SECRET_ACCESS_KEY
      ? {
          accessKeyId: parsed.SES_ACCESS_KEY_ID,
          secretAccessKey: parsed.SES_SECRET_ACCESS_KEY,
        }
      : {}),
    ...(parsed.SES_ENDPOINT_URL ? { endpoint: parsed.SES_ENDPOINT_URL } : {}),
    ...(parsed.SES_CONFIGURATION_SET ? { configurationSet: parsed.SES_CONFIGURATION_SET } : {}),
  };
}

function optionalGroup<T>(
  label: string,
  values: [string | undefined, string | undefined, string | undefined],
  create: (first: string, second: string, third: string) => T,
): T | null {
  if (values.every((value) => value === undefined || value === "")) return null;
  if (values.some((value) => value === undefined || value === "")) {
    throw new Error(`${label} configuration must be complete`);
  }
  return create(values[0] as string, values[1] as string, values[2] as string);
}
