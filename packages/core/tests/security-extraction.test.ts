import { describe, expect, test } from "vitest";

import { extractArticle, fingerprintContent } from "../src/extraction.js";
import { assertPublicHttpUrl, fetchTextSafely, isPrivateAddress } from "../src/security.js";

describe("outbound URL security", () => {
  test("rejects non-HTTP protocols", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow("HTTP or HTTPS");
  });

  test.each(["127.0.0.1", "10.0.0.4", "169.254.169.254", "192.168.1.2", "::1", "fd00::1"])(
    "recognizes private or reserved address %s",
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );

  test("rejects a hostname resolving to private space", async () => {
    await expect(
      assertPublicHttpUrl("https://example.com/article", async () => ["10.0.0.8"]),
    ).rejects.toThrow("public IP");
  });

  test("accepts a public HTTP destination", async () => {
    await expect(
      assertPublicHttpUrl("https://example.com/article", async () => ["93.184.216.34"]),
    ).resolves.toBe("https://example.com/article");
  });

  test("revalidates redirects before following them", async () => {
    const fetchImpl = async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
    await expect(
      fetchTextSafely("https://example.com/start", {
        fetchImpl,
        resolveAddresses: async () => ["93.184.216.34"],
      }),
    ).rejects.toThrow("public IP");
  });

  test("rejects responses above the byte limit", async () => {
    const fetchImpl = async () =>
      new Response("0123456789ABCDEF", { headers: { "content-length": "16" } });
    await expect(
      fetchTextSafely("https://example.com/large", {
        fetchImpl,
        maxBytes: 10,
        resolveAddresses: async () => ["93.184.216.34"],
      }),
    ).rejects.toThrow("maximum size");
  });

  test("surfaces conditional 304 responses without treating them as redirects", async () => {
    const result = await fetchTextSafely("https://example.com/feed.xml", {
      fetchImpl: async () => new Response(null, { status: 304 }),
      resolveAddresses: async () => ["93.184.216.34"],
    });
    expect(result.notModified).toBe(true);
    expect(result.text).toBe("");
  });
});

describe("article extraction", () => {
  test("extracts meaningful content and removes executable markup", () => {
    const paragraphs = Array.from(
      { length: 8 },
      (_, index) =>
        `<p>Technical paragraph ${index} explains rendering architecture with enough useful detail for a reader.</p>`,
    ).join("");
    const html = `<html><head><title>Rendering Deep Dive</title><meta property="og:image" content="/hero.png"><link rel="canonical" href="https://example.com/canonical"></head><body><main><article><h1>Rendering Deep Dive</h1>${paragraphs}<script>alert(1)</script><p onclick="steal()">Safe words</p><iframe src="https://tracker.example"></iframe></article></main></body></html>`;
    const extracted = extractArticle(html, "https://example.com/post");

    expect(extracted.title).toBe("Rendering Deep Dive");
    expect(extracted.canonicalUrl).toBe("https://example.com/canonical");
    expect(extracted.imageUrl).toBe("https://example.com/hero.png");
    expect(extracted.wordCount).toBeGreaterThan(80);
    expect(extracted.contentHtml).not.toMatch(/script|onclick|iframe/i);
    expect(extracted.contentHtml).toContain("Technical paragraph");
  });

  test("rejects title-only extraction", () => {
    const html = `<html><head><title>Only a title</title></head><body><article><h1>Only a title</h1><p>Short.</p></article></body></html>`;
    expect(() => extractArticle(html, "https://example.com/post")).toThrow(
      "too little useful text",
    );
  });

  test("creates stable fingerprints across harmless whitespace and case changes", () => {
    expect(fingerprintContent("Neural Rendering   Architecture\nBenchmarks")).toBe(
      fingerprintContent(" neural rendering architecture benchmarks "),
    );
    expect(fingerprintContent("Different technical subject")).not.toBe(
      fingerprintContent("neural rendering architecture benchmarks"),
    );
  });
});
