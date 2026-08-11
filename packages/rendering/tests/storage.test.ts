import { describe, expect, test } from "vitest";

import { MemoryAssetStore, safeAssetKey } from "../src/storage.js";

describe("private asset storage", () => {
  test("stores and retrieves assets without exposing provider URLs", async () => {
    const store = new MemoryAssetStore();
    await store.put("covers/test.png", Buffer.from("cover"), "image/png");
    const asset = await store.get("covers/test.png");
    expect(asset?.body.toString()).toBe("cover");
    expect(asset?.contentType).toBe("image/png");
  });

  test("rejects traversal and normalizes opaque asset keys", () => {
    expect(() => safeAssetKey("../secret")).toThrow("Invalid asset key");
    expect(safeAssetKey("covers/a_1-TEST.png")).toBe("covers/a_1-TEST.png");
  });
});
