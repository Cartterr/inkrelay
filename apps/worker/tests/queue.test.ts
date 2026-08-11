import { describe, expect, test } from "vitest";

import { DEAD_LETTER_QUEUE, DEFAULT_JOB_OPTIONS } from "../src/queue.js";

describe("worker reliability policy", () => {
  test("uses bounded exponential retries, leases, and a dead-letter destination", () => {
    expect(DEFAULT_JOB_OPTIONS.retryLimit).toBe(5);
    expect(DEFAULT_JOB_OPTIONS.retryBackoff).toBe(true);
    expect(DEFAULT_JOB_OPTIONS.retryDelay).toBeGreaterThan(0);
    expect(DEFAULT_JOB_OPTIONS.expireInSeconds).toBe(20 * 60);
    expect(DEFAULT_JOB_OPTIONS.deadLetter).toBe(DEAD_LETTER_QUEUE);
  });
});
