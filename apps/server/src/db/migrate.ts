import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "../lib/env";
import { createDb } from "./index";
import { MIGRATIONS_DIR, pendingMigrations } from "./migration-check";

fs.mkdirSync(path.dirname(env.databaseFile), { recursive: true });
const { db, sqlite } = createDb(env.databaseFile);

const pending = pendingMigrations(sqlite);
if (pending.length === 0) {
  console.log(`Database up to date: ${env.databaseFile}`);
} else {
  console.log(`Applying ${pending.length} migration(s) to ${env.databaseFile}: ${pending.join(", ")}`);
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  console.log("Done.");
}
sqlite.close();
