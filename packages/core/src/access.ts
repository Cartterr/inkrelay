import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateFeedAccessKey(): string {
  return randomBytes(32).toString("base64url");
}

export function generateOpaqueId(): string {
  return randomBytes(24).toString("base64url");
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function verifyFeedAccessKey(candidate: string, expectedDigest: string): boolean {
  const actual = Buffer.from(hashIdentifier(candidate), "utf8");
  const expected = Buffer.from(expectedDigest, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
