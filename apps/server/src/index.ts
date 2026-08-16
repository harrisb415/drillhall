import fs from "node:fs";
import path from "node:path";
import { loadAllPacks } from "@comptia/content";
import { createApp } from "./app";
import { createDb } from "./db";
import { pendingMigrations } from "./db/migration-check";
import { createAuth } from "./lib/auth";
import { env, REPO_ROOT, SERVER_ROOT } from "./lib/env";
import { createLogger } from "./lib/logger";
import { seedCerts } from "./modules/certs/content";
import { createEmailProvider } from "./modules/notifications/providers/email";
import cron, { type ScheduledTask } from "node-cron";
import { runBackup } from "./lib/backup";
import { startScheduler } from "./modules/notifications/scheduler";
import { createNotificationService } from "./modules/notifications/service";

const logger = createLogger();

if (env.isProd && env.authSecretIsFallback) {
  logger.fatal("BETTER_AUTH_SECRET is not set — refusing to start in production. See SECRETS.md.");
  process.exit(1);
}
if (env.authSecretIsFallback) {
  logger.warn("BETTER_AUTH_SECRET not set — using an insecure dev-only fallback.");
}

fs.mkdirSync(path.dirname(env.databaseFile), { recursive: true });
const { db, sqlite } = createDb(env.databaseFile);

const pending = pendingMigrations(sqlite);
if (pending.length > 0) {
  logger.fatal({ pending }, "Database has pending migrations — run `npm run db:migrate` first.");
  process.exit(1);
}

let packs;
try {
  packs = loadAllPacks();
} catch (err) {
  logger.fatal(err, "Content pack validation failed — fix the pack (see `npm run validate`).");
  process.exit(1);
}
const content = seedCerts(db, packs);
logger.info(
  { certs: packs.map((p) => `${p.code} (${p.quiz.length} questions, ${p.flashcards.length} cards)`) },
  "content packs loaded",
);

const rootPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
  version: string;
};

const sendEmail = createEmailProvider({ apiKey: env.resendApiKey, from: env.emailFrom, logger });
const auth = createAuth({
  db,
  secret: env.authSecret,
  baseURL: env.baseURL,
  trustedOrigins: env.trustedOrigins,
  google: env.google,
  sendEmail,
});

const clientDist = path.resolve(SERVER_ROOT, "../client/dist");
const app = createApp({
  db,
  sqlite,
  auth,
  content,
  logger,
  meta: { name: "Drillhall", version: rootPkg.version, googleEnabled: env.google !== null },
  clientDist,
  emailDeliveryConfigured: !!env.resendApiKey,
});

// One in-process timer is the whole scheduling layer (spec §6). This assumes a
// single instance — do not run a pm2 cluster, or the reminders double up
// (they wouldn't actually send twice thanks to the unique index, but the
// wasted work and log noise are pointless).
const notifications = createNotificationService({ db, sendEmail, logger });
const scheduler = startScheduler({
  db,
  content,
  notifications,
  logger,
  baseURL: env.baseURL,
});

// Nightly snapshot. Backups live with the app rather than in an external cron
// so a fresh deployment is protected without a second setup step being
// remembered; BACKUP_CRON="" opts out where a real backup system exists.
let backupTask: ScheduledTask | null = null;
if (env.backupCron) {
  backupTask = cron.schedule(env.backupCron, () => {
    runBackup({
      sqlite,
      dir: env.backupDir,
      retentionDays: env.backupRetentionDays,
      logger,
    }).catch((err) => logger.error(err, "scheduled backup failed"));
  });
  logger.info(
    { cron: env.backupCron, dir: env.backupDir, retentionDays: env.backupRetentionDays },
    "backup scheduler started",
  );
}

const server = app.listen(env.port, () => {
  logger.info(
    {
      port: env.port,
      baseURL: env.baseURL,
      db: env.databaseFile,
      google: env.google !== null,
      resend: !!env.resendApiKey,
      static: fs.existsSync(clientDist),
    },
    `server listening on http://localhost:${env.port}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    void scheduler.stop();
    void backupTask?.stop();
    server.close(() => {
      sqlite.close();
      process.exit(0);
    });
  });
}
