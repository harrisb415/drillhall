import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** apps/server */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO_ROOT = path.resolve(SERVER_ROOT, "../..");

// A local apps/server/.env wins over the repo-root .env (dotenv keeps the first value it sees).
dotenv.config({ path: [path.join(SERVER_ROOT, ".env"), path.join(REPO_ROOT, ".env")], quiet: true });

function resolveDbFile(url: string): string {
  const p = url.replace(/^file:/, "");
  return path.isAbsolute(p) ? p : path.resolve(SERVER_ROOT, p);
}

const port = Number(process.env.PORT ?? 3001);
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const env = {
  isProd: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test" || !!process.env.VITEST,
  port,
  databaseFile: resolveDbFile(process.env.DATABASE_URL ?? "file:./data/app.db"),
  /** Missing in production is a fatal boot error (checked in index.ts). */
  authSecret: process.env.BETTER_AUTH_SECRET ?? "dev-only-insecure-secret-0123456789abcdef",
  authSecretIsFallback: !process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
  google:
    googleClientId && googleClientSecret
      ? { clientId: googleClientId, clientSecret: googleClientSecret }
      : null,
  resendApiKey: process.env.RESEND_API_KEY,
  backupDir: path.isAbsolute(process.env.BACKUP_DIR ?? "")
    ? process.env.BACKUP_DIR!
    : path.resolve(SERVER_ROOT, process.env.BACKUP_DIR ?? "../../backups"),
  /** Nightly at 03:15 by default; set BACKUP_CRON="" to disable. */
  backupCron: process.env.BACKUP_CRON ?? "15 3 * * *",
  backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? 14),
  emailFrom: process.env.EMAIL_FROM ?? "CompTIA Prep <onboarding@resend.dev>",
  trustedOrigins: [
    "http://localhost:5173",
    ...(process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ],
};
