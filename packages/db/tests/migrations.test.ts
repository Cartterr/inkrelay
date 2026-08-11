import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { databaseMigrationsPath } from "../src/migration-path.js";

interface MigrationJournal {
  dialect: string;
  entries: Array<{ idx: number; tag: string }>;
}

describe("migration bundle", () => {
  test("ships a Drizzle journal for every SQL migration", async () => {
    const journalPath = path.join(databaseMigrationsPath, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as MigrationJournal;

    expect(journal.dialect).toBe("postgresql");
    expect(journal.entries.map(({ idx, tag }) => ({ idx, tag }))).toEqual([
      { idx: 0, tag: "0000_initial" },
      { idx: 1, tag: "0001_direct_kindle_delivery" },
      { idx: 2, tag: "0002_split_kindle_documents" },
    ]);

    await Promise.all(
      journal.entries.map(({ tag }) => access(path.join(databaseMigrationsPath, `${tag}.sql`))),
    );
  });
});
