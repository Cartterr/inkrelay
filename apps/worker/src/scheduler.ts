import type { SourceDefinition } from "@inkrelay/core";
import type { JobName } from "@inkrelay/db";

export interface ScheduledJob {
  name: JobName;
  data: Record<string, unknown>;
  singletonKey: string;
  retryLimit: number;
}

const TIME_ZONE = "America/Santiago";

export function buildSchedulePlan(now: Date, sources: readonly SourceDefinition[]): ScheduledJob[] {
  const local = localParts(now);
  const jobs: ScheduledJob[] = [];

  if (local.minute < 15) {
    const hourBucket = `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}`;
    for (const source of sources.filter((item) => item.enabled)) {
      jobs.push({
        name: "poll-source",
        data: { sourceId: source.id },
        singletonKey: `poll:${source.id}:${hourBucket}`,
        retryLimit: 5,
      });
    }
  }

  if (local.weekday === "Sat" && local.hour === 18 && local.minute < 15) {
    const editionId = isoWeekId(local.year, local.month, local.day);
    jobs.push({
      name: "publish-edition",
      data: { editionId },
      singletonKey: `edition:${editionId}`,
      retryLimit: 2,
    });
  }

  if (local.hour === 3 && local.minute < 15) {
    const date = `${local.year}-${pad(local.month)}-${pad(local.day)}`;
    jobs.push({
      name: "cleanup-retention",
      data: { requestedAt: now.toISOString() },
      singletonKey: `cleanup:${date}`,
      retryLimit: 3,
    });
  }

  return jobs;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

function localParts(date: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: value("weekday"),
  };
}

function isoWeekId(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.valueOf() - firstDay.valueOf()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
