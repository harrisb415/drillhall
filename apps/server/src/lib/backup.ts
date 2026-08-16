import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { Logger } from "./logger";

export interface BackupOptions {
  sqlite: Database.Database;
  /** Directory to write snapshots into; created if missing. */
  dir: string;
  /** Snapshots older than this many days are pruned after a successful run. */
  retentionDays: number;
  logger: Logger;
}

/**
 * Takes a consistent snapshot using SQLite's own backup API.
 *
 * A plain file copy is not safe here: the database runs in WAL mode, so a copy
 * can catch a write mid-flight and miss the WAL contents entirely, producing a
 * file that restores to a torn or stale state. `VACUUM INTO` writes a fully
 * consistent, already-compacted database without blocking readers.
 */
export async function runBackup(opts: BackupOptions): Promise<string> {
  fs.mkdirSync(opts.dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(opts.dir, `app-${stamp}.db`);

  // VACUUM INTO refuses to overwrite, which is the behaviour we want.
  opts.sqlite.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  const { size } = fs.statSync(target);
  opts.logger.info({ target, bytes: size }, "database snapshot written");
  pruneOldBackups(opts, target);
  return target;
}

/**
 * Deletes snapshots past the retention window. The snapshot just taken is
 * never a candidate, so a misconfigured retention can't leave zero backups.
 */
export function pruneOldBackups(opts: BackupOptions, keep?: string): number {
  const cutoff = Date.now() - opts.retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of fs.readdirSync(opts.dir)) {
    if (!name.startsWith("app-") || !name.endsWith(".db")) continue;
    const full = path.join(opts.dir, name);
    if (keep && path.resolve(full) === path.resolve(keep)) continue;
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed++;
    }
  }
  if (removed > 0) opts.logger.info({ removed }, "pruned expired snapshots");
  return removed;
}
