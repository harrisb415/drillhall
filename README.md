# CompTIA Prep

Self-hosted, multi-user CompTIA exam prep platform. React + Vite client, Express + better-sqlite3 server, Better Auth (email/password + Google), content shipped as validated data packs.

**Status: Phases 1–2 complete** (see `comptia-platform-build-spec.md` §13 for the phase plan).

- **Phase 1** — auth, flashcards, MC quiz, reference sheets, dashboard, content validator, committed migrations + boot-time fail-fast check, rate limiting, structured logging, `/health`, CI.
- **Phase 2** — second cert pack (A+ Core 2) proving the schema generalizes, cert switcher, all three PBQ engines (drag-to-order, drag-to-match, terminal sim), recency-weighted readiness scoring.
- **Phase 3** — public marketing homepage at `/` (dashboard moved to `/dashboard`), password reset flow, friendly auth errors, password visibility toggle, return-to-destination after login, verification-email resend.
- **Exam simulator** (Phase 2 addendum) — five randomized, timed exam types with server-authoritative timing and CompTIA-style scaled scoring. See below.
- **Phase 4** — exam planner, notification preferences page, and an in-process `node-cron` scheduler sending exam reminders, inactivity nudges, and a weekly digest. See below.

## Quickstart (dev)

```bash
npm ci
cp .env.example .env        # fill in BETTER_AUTH_SECRET at minimum (see SECRETS.md)
npm run db:migrate
npm run dev                 # server :3001 + Vite client :5173 (proxied /api)
```

Open http://localhost:5173. Without `RESEND_API_KEY`, verification emails are logged to the server console instead of sent. Without Google credentials, the Google button hides itself.

## Production (VM)

```bash
npm ci
npm run build               # typechecks everything + bundles client to apps/client/dist
npm run db:migrate
NODE_ENV=production npm start   # Express serves API + static client on :3001
```

The server **refuses to boot** if committed migrations haven't been applied, and refuses to start in production without `BETTER_AUTH_SECRET`. See `DEPLOY.md` for pm2/systemd + Tailscale, `BACKUP.md` for SQLite snapshots.

## Layout

```
apps/client        React SPA — features/* mirror server modules/*
apps/server        Express API, Better Auth, Drizzle + SQLite
packages/content   Cert packs (JSON) + Zod schema + validator (fails CI on bad content)
packages/shared-types  API DTOs shared client↔server
```

## Commands

| Command | What |
|---|---|
| `npm run dev` | server + client dev servers |
| `npm run build` | typecheck all + client bundle |
| `npm test` | vitest across workspaces (auth integration, API flow, validator) |
| `npm run validate` | content pack validator |
| `npm run db:generate` | drizzle-kit generate after schema changes (commit the output) |
| `npm run db:migrate` | apply committed migrations |

## Adding content

Edit `packages/content/<pack>/*.json`, then `npm run validate`. A new cert = a new folder with `cert.json`, `domains.json`, `flashcards.json`, `quiz.json`, `reference.json` — **zero code changes**.

Any part may be either a single `<part>.json` array **or** a `<part>/` folder of JSON arrays that get concatenated (files are read in filename order). The A+ banks use `quiz/d1-mobile.json`, `quiz/d3-hardware.json`, and so on, so a 190-question bank stays reviewable per domain instead of living in one unmergeable array. Duplicate ids across files fail validation rather than silently merging. The server seeds it on boot (matching rows by `code`, so ids stay stable) and it appears in the cert switcher. `aplus-core2` was added exactly this way.

Question types (one `QuizQuestionSchema` discriminated union, all graded server-side):

| Type | Shape | Client |
|---|---|---|
| `mc` | `choices[]` + `answerIndex` | radio-style buttons |
| `order` | `items[]` in correct order | `@hello-pangea/dnd`, server shuffles before sending |
| `match` | `pairs[]` of `{left, right}` | `@hello-pangea/dnd`, server shuffles the rights |
| `terminal` | `expected[]` acceptable commands | `xterm.js`, case/whitespace-insensitive match |

Answers and explanations never reach the client until after grading.

## Exam simulator

Modelled on the real thing: up to 90 questions in 90 minutes, scaled 100–900, pass at 675 (Core 1) / 700 (Core 2), performance-based questions first, free navigation with flag-for-review, and **no feedback until you submit**.

| Type | Draw |
|---|---|
| Full mock | Full length, blueprint-weighted |
| Half mock | Half length, same weighting |
| Domain drill | 20q from domains you choose |
| PBQ gauntlet | Performance-based questions only |
| Weak areas | Weighted toward your lowest recency-weighted mastery |

Each cert declares only four numbers (`exam` in `cert.json`); the modes are derived, so a new pack inherits all five.

**Randomization.** Every attempt draws a fresh weighted sample, deprioritizes questions from your last three exams, and shuffles multiple-choice option order so a repeat sighting can't be answered from position memory. The shuffle is stored per session and mapped back at grading time.

Novelty is bounded by pool size — two exams of N questions from a bank of B must share at least `2N − B`. With ~185 questions per cert, **every mode currently has zero forced repeat**, including a back-to-back pair of full 90-question mocks. The PBQ gauntlet is deliberately capped at half the PBQ pool for the same reason, since performance-based questions are the most expensive to author.

| Cert | Questions | of which PBQ | Full mock forced repeat |
|---|---|---|---|
| A+ Core 1 (220-1101) | 188 | 16 | 0% |
| A+ Core 2 (220-1102) | 185 | 19 | 0% |

**Timing is server-authoritative.** The deadline lives in the database; answers are rejected after it and a reload resumes with the correct remaining time rather than restarting the clock. Unanswered questions count as incorrect, as they would on the real exam.

**Scaled scoring is an approximation and says so.** CompTIA doesn't publish the raw→scaled curve, so this uses a two-segment linear map anchored on the official pass mark. The pass/fail verdict is exact against the configured raw threshold; only the displayed number is modelled.

Exam answers flow into the same `quiz_attempts` table as practice, so readiness and per-domain mastery absorb them automatically. Exam results are shown *beside* readiness on the dashboard, not blended into it.

## Notifications & the exam planner

Set an exam date per cert on the dashboard; the countdown and reminders follow from it. Preferences live at `/settings` — a master email switch, exam reminders with selectable lead times (30/14/7/3/1/0 days), inactivity nudges, and a weekly digest. Every toggle is wired to something real; nothing is a placeholder.

**The whole scheduling layer is one in-process `node-cron` job** running every 30 minutes (spec §6). No Redis, no queue, no leader election. **Run a single instance** — a pm2 cluster would duplicate the work.

**Dedupe is a database constraint, not a check.** Each send first claims a row in `notification_log`, whose unique index on `(user_id, type, window_key)` makes a second claim throw. A repeated sweep, a restart, or two racing processes cannot produce a duplicate email, because the claim happens before the send rather than after a check. A send that fails after claiming is *not* retried — a missed nudge costs less than a retry storm.

**Dates are UTC throughout.** An exam date is a calendar date stored as midnight UTC, so all comparisons use `lib/dates.ts` rather than local-time helpers. Mixing the two silently shifts the day for anyone at a negative UTC offset — a date picked as the 25th reads back as the 24th in Los Angeles, and reminders fire early. The `timezone` column is captured but per-user delivery *timing* remains a Phase 5 concern, and the settings page says so.

Without `RESEND_API_KEY` every notification is written to the server log instead of sent, and the settings page tells the user that rather than pretending mail went out.

## Readiness scoring

Two distinct weightings (spec §7), in `modules/analytics/readiness.ts`:

1. **Recency weighting** — a domain's mastery is an exponentially decayed average (0.85 per step, most recent 30 attempts), so yesterday's answers count more than last month's.
2. **Exam weighting** — overall readiness is `Σ(domain mastery × official exam weight)`.

Untouched domains contribute 0 to overall readiness (unstudied material genuinely means you aren't ready) while showing "no data" per-domain rather than a misleading 0%.

## Routes

| Path | Access |
|---|---|
| `/` | public marketing page (redirects to `/dashboard` when signed in) |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | public |
| `/dashboard`, `/flashcards`, `/quiz`, `/reference` | session required |
| `/api/meta`, `/api/catalog`, `/health` | public (counts and status only) |

## Auth notes

- `better-auth` is pinned exact (spec §3); the Drizzle adapter ships inside the core package.
- `apps/server/src/db/auth-schema.ts` is CLI-generated (`npx @better-auth/cli generate --config src/lib/auth-cli-config.ts`). Re-run it only when the auth config changes, then `npm run db:generate` and commit both.
