// Boots the real server for the Playwright suite against a throwaway
// database. Written as a script rather than inline shell so the env vars work
// identically on Windows and Linux (CI).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = path.join(root, "apps", "server", "data", "e2e.db");

// Always start from an empty database so the suite's assertions about a brand
// new account are actually testing that, not leftovers from a previous run.
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${dbFile}${suffix}`, { force: true });
}

const env = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3111",
  DATABASE_URL: `file:${dbFile}`,
  BETTER_AUTH_URL: "http://localhost:3111",
  BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
  // No outbound mail and no timers competing with the tests.
  RESEND_API_KEY: "",
  BACKUP_CRON: "",
  LOG_LEVEL: "warn",
};

const run = (args) => {
  const result = spawnSync("npm", args, { cwd: root, env, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(["run", "db:migrate"]);
run(["run", "start"]);
