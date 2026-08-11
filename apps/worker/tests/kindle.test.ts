import { describe, expect, test } from "vitest";

import { buildKindleMimeMessage } from "../src/kindle.js";

describe("Kindle email delivery", () => {
  test("builds a Send-to-Kindle compatible EPUB attachment", () => {
    const message = buildKindleMimeMessage({
      senderEmail: "delivery@example.com",
      destinationEmail: "reader_123@kindle.com",
      editionId: "2026-W33",
      rank: 3,
      title: "Rendering Architecture: A Deep Dive",
      sourceName: "ACM SIGGRAPH Blog",
      epub: Buffer.from("valid-epub-fixture"),
      boundary: "inkrelay-test-boundary",
    }).toString("utf8");

    expect(message).toContain("From: InkRelay <delivery@example.com>");
    expect(message).toContain("To: reader_123@kindle.com");
    expect(message).toContain(
      "Subject: InkRelay 03 | ACM SIGGRAPH Blog | Rendering Architecture: A Deep Dive",
    );
    expect(message).toContain("Content-Type: application/epub+zip");
    expect(message).toContain(
      'filename="inkrelay-2026-W33-03-acm-siggraph-blog-rendering-architecture-a-deep-dive.epub"',
    );
    expect(message).toContain(Buffer.from("valid-epub-fixture").toString("base64"));
  });

  test("rejects header injection and empty EPUBs", () => {
    expect(() =>
      buildKindleMimeMessage({
        senderEmail: "delivery@example.com\r\nBcc: attacker@example.com",
        destinationEmail: "reader@kindle.com",
        editionId: "2026-W33",
        rank: 1,
        title: "Article",
        sourceName: "Source",
        epub: Buffer.from("epub"),
      }),
    ).toThrow("email address");
    expect(() =>
      buildKindleMimeMessage({
        senderEmail: "delivery@example.com",
        destinationEmail: "reader@kindle.com",
        editionId: "2026-W33",
        rank: 1,
        title: "Article",
        sourceName: "Source",
        epub: Buffer.alloc(0),
      }),
    ).toThrow("empty");
  });
});
