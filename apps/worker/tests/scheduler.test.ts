import { SOURCES } from "@inkrelay/core";
import { describe, expect, test } from "vitest";

import { buildSchedulePlan } from "../src/scheduler.js";

describe("15-minute scheduler", () => {
  test("enqueues one hourly poll for all 58 sources with idempotency keys", () => {
    const plan = buildSchedulePlan(new Date("2026-08-11T13:00:00.000Z"), SOURCES);
    const polls = plan.filter((item) => item.name === "poll-source");
    expect(polls).toHaveLength(58);
    expect(new Set(polls.map((item) => item.singletonKey)).size).toBe(58);
  });

  test("enqueues the weekly edition only at Saturday 18:00 America/Santiago", () => {
    const due = buildSchedulePlan(new Date("2026-08-15T22:00:00.000Z"), SOURCES);
    const early = buildSchedulePlan(new Date("2026-08-15T21:45:00.000Z"), SOURCES);
    expect(due.filter((item) => item.name === "publish-edition")).toHaveLength(1);
    expect(early.filter((item) => item.name === "publish-edition")).toHaveLength(0);
  });

  test("does not enqueue hourly polls outside the first 15-minute window", () => {
    const plan = buildSchedulePlan(new Date("2026-08-11T13:30:00.000Z"), SOURCES);
    expect(plan.filter((item) => item.name === "poll-source")).toHaveLength(0);
  });
});
