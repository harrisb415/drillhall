import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { pino } from "pino";
import request from "supertest";
import type { Express } from "express";
import { loadAllPacks } from "@comptia/content";
import { createApp } from "../src/app";
import { MIGRATIONS_DIR } from "../src/db/migration-check";
import * as schema from "../src/db/schema";
import { createAuth } from "../src/lib/auth";
import { seedCerts, type ContentIndex } from "../src/modules/certs/content";
import type { EmailMessage } from "../src/modules/notifications/providers/email";

export interface TestStack {
  app: Express;
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
  auth: ReturnType<typeof createAuth>;
  emails: EmailMessage[];
  content: ContentIndex;
  certId: number;
}

export function createTestStack(opts?: {
  google?: { clientId: string; clientSecret: string };
  /** Most suites hammer the auth endpoints; only the rate-limit suite wants them live. */
  rateLimit?: boolean;
}): TestStack {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const emails: EmailMessage[] = [];
  const auth = createAuth({
    db,
    secret: "test-secret-must-be-long-0123456789abcdef",
    baseURL: "http://localhost:3001",
    trustedOrigins: [],
    google: opts?.google ?? null,
    sendEmail: async (msg) => {
      emails.push(msg);
    },
  });

  const content = seedCerts(db, loadAllPacks());
  const certId = content.certIdByCode.get("aplus")!;

  const app = createApp({
    db,
    sqlite,
    auth,
    content,
    logger: pino({ level: "silent" }),
    meta: { name: "test", version: "0.0.0-test", googleEnabled: !!opts?.google },
    clientDist: null,
    disableRateLimit: opts?.rateLimit !== true,
  });

  return { app, db, sqlite, auth, emails, content, certId };
}

export async function signUp(
  app: Express,
  user: { email?: string; password?: string; name?: string } = {},
): Promise<{ status: number; cookie: string; body: unknown }> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: user.email ?? "test@example.com",
      password: user.password ?? "hunter2hunter2",
      name: user.name ?? "Test User",
    });
  const rawCookies = res.headers["set-cookie"] as string[] | string | undefined;
  const setCookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie, body: res.body };
}
