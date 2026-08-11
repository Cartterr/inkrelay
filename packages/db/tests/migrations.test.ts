import { access, readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

interface MigrationJournal {
  dialect: string;
  entries: Array<{ idx: number; tag: string }>;
}

describe("migration bundle", () => {
  test("ships a Drizzle journal for every SQL migration", async () => {
    const journalUrl = new URL("../migrations/meta/_journal.json", import.meta.url);
    const journal = JSON.parse(await readFile(journalUrl, "utf8")) as MigrationJournal;

    expect(journal.dialect).toBe("postgresql");
    expect(journal.entries.map(({ idx, tag }) => ({ idx, tag }))).toEqual([
      { idx: 0, tag: "0000_initial" },
    ]);

    await Promise.all(
      journal.entries.map(({ tag }) =>
        access(new URL(`../migrations/${tag}.sql`, import.meta.url)),
      ),
    );
  });
});
