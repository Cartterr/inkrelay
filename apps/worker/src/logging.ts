import pino from "pino";

export function createLogger(level: string) {
  return pino({
    level,
    base: { service: process.env.RAILWAY_SERVICE_NAME ?? "inkrelay-worker" },
    redact: {
      paths: [
        "*.url",
        "*.feedKey",
        "*.articleAccessId",
        "*.assetAccessId",
        "*.authorization",
        "*.apiKey",
        "*.secret",
      ],
      censor: "[redacted]",
    },
  });
}
