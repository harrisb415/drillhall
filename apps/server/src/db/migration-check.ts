import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Tags from the committed migration journal that have not been applied to this
 * database. Non-empty means the server must refuse to boot (see index.ts) —
 * booting into a schema mismatch is worse than not booting.
 */
export function pendingMigrations(sqlite: Database.Database): string[] {
  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) return [];
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: { tag: string }[];
  };
  let applied = 0;
  try {
    const row = sqlite.prepare("select count(*) as c from __drizzle_migrations").get() as { c: number };
    applied = row.c;
  } catch {
    applied = 0; // migrations table doesn't exist yet — everything is pending
  }
  return journal.entries.slice(applied).map((e) => e.tag);
}
