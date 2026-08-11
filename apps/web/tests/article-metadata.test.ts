import { describe, expect, test } from "vitest";

import { metadata } from "../app/a/[articleAccessId]/[slug]/page";

describe("article route metadata", () => {
  test("does not prohibit server-side readers from extracting an opaque article page", () => {
    expect(metadata.robots).not.toMatchObject({ index: false });
  });
});
