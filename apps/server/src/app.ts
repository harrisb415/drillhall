import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { toNodeHandler } from "better-auth/node";
import { ZodError } from "zod";
import type Database from "better-sqlite3";
import type { MetaDto } from "@comptia/shared-types";
import type { Db } from "./db";
import type { Auth } from "./lib/auth";
import type { Logger } from "./lib/logger";
import { requireAuth } from "./middleware/require-auth";
import type { ContentIndex } from "./modules/certs/content";
import { certsRoutes } from "./modules/certs/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { flashcardsRoutes } from "./modules/flashcards/routes";
import { quizRoutes } from "./modules/quiz/routes";
import { referenceRoutes } from "./modules/reference/routes";
import { settingsRoutes } from "./modules/settings/routes";
import type { ApiDeps } from "./modules/shared";

export interface AppDeps {
  db: Db;
  sqlite: Database.Database;
  auth: Auth;
  content: ContentIndex;
  logger: Logger;
  meta: MetaDto;
  /** Absolute path to the built client, or null to skip static serving (dev/tests). */
  clientDist: string | null;
  /** Tests hammer the auth endpoints; they switch this off. */
  disableRateLimit?: boolean;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY) {
    app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  }

  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: () => crypto.randomUUID(),
      autoLogging: {
        ignore: (req) => req.url === "/health" || req.url === "/api/health",
      },
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers[\"set-cookie\"]"],
    }),
  );

  const healthHandler: RequestHandler = (_req, res) => {
    try {
      deps.sqlite.prepare("select 1").get();
      res.json({ status: "ok", version: deps.meta.version });
    } catch {
      res.status(503).json({ status: "db_unreachable" });
    }
  };
  app.get(["/health", "/api/health"], healthHandler);
  app.get("/api/meta", (_req, res) => res.json(deps.meta));

  // Auth: rate-limited, and mounted BEFORE express.json() — Better Auth reads the body itself.
  //
  // Two limits, because one number can't serve both jobs. The client's session
  // hook polls get-session several times a minute, so a single strict budget
  // locks out an ordinary studying user long before it inconveniences an
  // attacker. Credential endpoints — the only brute-forceable ones — keep a
  // tight budget; session reads get a generous one.
  const limiterOpts = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: "draft-8" as const,
    legacyHeaders: false,
    skip: () => deps.disableRateLimit === true,
  };
  const credentialLimiter = rateLimit({
    ...limiterOpts,
    limit: 20,
    message: { error: "Too many sign-in attempts — try again later" },
  });
  const sessionLimiter = rateLimit({
    ...limiterOpts,
    limit: 1000,
    message: { error: "Too many auth requests — try again later" },
  });
  const CREDENTIAL_PATHS = /^\/api\/auth\/(sign-in|sign-up|forget-password|reset-password)/;
  app.all("/api/auth/*", (req, res, next) => {
    const limiter = CREDENTIAL_PATHS.test(req.originalUrl.split("?")[0]!)
      ? credentialLimiter
      : sessionLimiter;
    limiter(req, res, next);
  });
  app.all("/api/auth/*", toNodeHandler(deps.auth));

  app.use(express.json());

  const apiDeps: ApiDeps = { db: deps.db, content: deps.content };
  const guard = requireAuth(deps.auth);
  app.use("/api", guard, certsRoutes(apiDeps));
  app.use("/api", guard, flashcardsRoutes(apiDeps));
  app.use("/api", guard, referenceRoutes(apiDeps));
  app.use("/api", guard, quizRoutes(apiDeps));
  app.use("/api", guard, dashboardRoutes(apiDeps));
  app.use("/api", guard, settingsRoutes(apiDeps));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  if (deps.clientDist && fs.existsSync(deps.clientDist)) {
    const dist = deps.clientDist;
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "Invalid request",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }
    const log = (req as { log?: Logger }).log ?? deps.logger;
    log.error(err);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
