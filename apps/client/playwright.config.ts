import { defineConfig, devices } from "@playwright/test";

const PORT = 3111;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * The e2e suite runs the real server against a throwaway database, so it
 * exercises the same Express app, auth, and content packs a user hits — not a
 * mocked API. A separate port and DATABASE_URL keep it clear of the dev
 * instance and its data.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build the client, migrate a fresh DB, then serve — the same path
    // production takes, so the test can't pass against a stale bundle.
    command: "npm run e2e:server",
    cwd: "../..",
    url: `${BASE_URL}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
