# Drillhall

Drillhall is a self-hosted, multi-user CompTIA exam prep platform. React + Vite client, Express + better-sqlite3 server, Better Auth (email/password + Google), content shipped as validated data packs.

**Status: v1.11.1 — Phases 1–5 complete**, plus the exam simulator addendum (see `comptia-platform-build-spec.md` §13 for the phase plan and [CHANGELOG.md](CHANGELOG.md) for release history). Four cert packs shipped: A+ Core 1 (220-1201), A+ Core 2 (220-1202), Network+ (N10-009), Security+ (SY0-701).

- **Phase 1** — auth, flashcards, MC quiz, reference sheets, dashboard, content validator, committed migrations + boot-time fail-fast check, rate limiting, structured logging, `/health`, CI.
- **Phase 2** — second cert pack (A+ Core 2) proving the schema generalizes, cert switcher, all three PBQ engines (drag-to-order, drag-to-match, terminal sim), recency-weighted readiness scoring.
- **Phase 3** — public marketing homepage at `/` (dashboard moved to `/dashboard`), password reset flow, friendly auth errors, password visibility toggle, return-to-destination after login, verification-email resend.
- **Exam simulator** (Phase 2 addendum) — five randomized, timed exam types with server-authoritative timing and CompTIA-style scaled scoring. See below.
- **Phase 4** — exam planner, notification preferences page, and an in-process `node-cron` scheduler sending exam reminders, inactivity nudges, and a weekly digest. See below.
- **Phase 5** — gamification (XP, streaks, levels) with the race-safe transaction the spec calls for, per-user timezone-aware notification delivery, nightly backup automation, a low-confidence indicator on readiness, and Playwright e2e coverage.
- **Network+ and Security+ packs**, each grown to ~180+ questions, and a practice-mode fix so multiple-choice option order shuffles per session instead of favoring the first-listed choice.
- **Self-service account deletion** at `/settings` — cascades through every owned table, including unlinking Google.
- **Self-service progress reset** at `/settings` — wipes XP, level, streaks, and every quiz/exam/flashcard/course record back to a fresh account, without touching the account itself, notification settings, or a booked exam date.
- **Visual identity** — charcoal-and-brass palette, radial mastery gauges, score sparklines, rank insignia and a tiered streak flame. See below.
- **Light/dark/system theme toggle**, and **installable as a PWA** on iOS and Android with an offline app shell. See below.
- **Course** — a reading-based study track per cert, with a dashboard cross-reference of what you've read against what you've proven by quiz. Video was left out of scope on purpose.
- **Admin panel** at `/admin` for user management, gated on a `role` field. See below.

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

Edit `packages/content/<pack>/*.json`, then `npm run validate`. A new cert = a new folder with `cert.json`, `domains.json`, `flashcards.json`, `quiz.json`, `reference.json`, and optionally `course.json` — **zero code changes**. `course.json` is optional; packs without it validate fine and the Course page shows an empty state for that cert.

Any part may be either a single `<part>.json` array **or** a `<part>/` folder of JSON arrays that get concatenated (files are read in filename order). The A+ banks use `quiz/d1-mobile.json`, `quiz/d3-hardware.json`, and so on, so a 200+-question bank stays reviewable per domain instead of living in one unmergeable array. Duplicate ids across files fail validation rather than silently merging. The server seeds it on boot (matching rows by `code`, so ids stay stable) and it appears in the cert switcher. `aplus-core2` was added exactly this way.

Question types (one `QuizQuestionSchema` discriminated union, all graded server-side):

| Type | Shape | Client |
|---|---|---|
| `mc` | `choices[]` + `answerIndex` | radio-style buttons |
| `order` | `items[]` in correct order | `@hello-pangea/dnd`, server shuffles before sending |
| `match` | `pairs[]` of `{left, right}` | `@hello-pangea/dnd`, server shuffles the rights |
| `terminal` | `expected[]` acceptable commands | `xterm.js`, case/whitespace-insensitive match |

Answers and explanations never reach the client until after grading.

## Admin

`/admin` lists every account and can ban/unban, promote/demote, force sign-out, delete, and set a password directly. That last one matters here specifically: with no outbound email configured, the normal "forgot password" link goes nowhere, so this is the only working recovery path.

Built on Better Auth's official **admin plugin** rather than hand-rolled role checks — authorization is exactly the code not worth writing yourself, and the plugin already handles revoking a banned user's live sessions and refusing self-lockout.

**Granting the first admin is deliberately outside the app:**

```bash
node scripts/grant-admin.mjs you@example.com          # promote
node scripts/grant-admin.mjs someone@example.com --revoke
```

If any signed-in user could reach an endpoint that made them an admin, the gate would be decorative — so promotion has to start with someone holding shell access to the database. After that, an existing admin can promote others from the panel. The account must have signed in at least once before it can be promoted (there's no row otherwise), and the user may need to sign out and back in for a role change to take effect, since an existing session was minted with the old value.

The nav item only renders for admins, but that's cosmetic. Every action is authorized server-side, and non-admin requests to admin routes get a **404 rather than a 403** — an admin surface shouldn't confirm its own existence to someone who isn't one. `apps/server/test/admin.test.ts` covers the escalation cases directly: an ordinary user can neither promote themselves nor ban anyone else.

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

**Randomization.** Every attempt draws a fresh weighted sample, deprioritizes questions from your last three exams, and shuffles multiple-choice option order so a repeat sighting can't be answered from position memory. The shuffle is stored per session and mapped back at grading time. Practice mode (not just exam mode) shuffles the same way — `buildChoiceOrders`/`applyChoiceOrder` in `modules/quiz/grade.ts` are shared by both.

Novelty is bounded by pool size — two exams of N questions from a bank of B must share at least `2N − B`. With ~180+ questions per cert, **every mode currently has zero forced repeat**, including a back-to-back pair of full 90-question mocks. The PBQ gauntlet is deliberately capped at half the PBQ pool for the same reason, since performance-based questions are the most expensive to author.

| Cert | Questions | of which PBQ | Full mock forced repeat |
|---|---|---|---|
| A+ Core 1 (220-1201) | 215 | 16 | 0% |
| A+ Core 2 (220-1202) | 217 | 20 | 0% |
| Network+ (N10-009) | 218 | 10 | 0% |
| Security+ (SY0-701) | 219 | 10 | 0% |

**Timing is server-authoritative.** The deadline lives in the database; answers are rejected after it and a reload resumes with the correct remaining time rather than restarting the clock. Unanswered questions count as incorrect, as they would on the real exam.

**Scaled scoring is an approximation and says so.** CompTIA doesn't publish the raw→scaled curve, so this uses a two-segment linear map anchored on the official pass mark. The pass/fail verdict is exact against the configured raw threshold; only the displayed number is modelled.

Exam answers flow into the same `quiz_attempts` table as practice, so readiness and per-domain mastery absorb them automatically. Exam results are shown *beside* readiness on the dashboard, not blended into it.

## Notifications & the exam planner

Set an exam date per cert on the dashboard; the countdown and reminders follow from it. Preferences live at `/settings` — a master email switch, exam reminders with selectable lead times (30/14/7/3/1/0 days), inactivity nudges, and a weekly digest. Every toggle is wired to something real; nothing is a placeholder.

**The whole scheduling layer is one in-process `node-cron` job** running every 30 minutes (spec §6). No Redis, no queue, no leader election. **Run a single instance** — a pm2 cluster would duplicate the work.

**Dedupe is a database constraint, not a check.** Each send first claims a row in `notification_log`, whose unique index on `(user_id, type, window_key)` makes a second claim throw. A repeated sweep, a restart, or two racing processes cannot produce a duplicate email, because the claim happens before the send rather than after a check. A send that fails after claiming is *not* retried — a missed nudge costs less than a retry storm.

**Dates are UTC throughout.** An exam date is a calendar date stored as midnight UTC, so all comparisons use `lib/dates.ts` rather than local-time helpers. Mixing the two silently shifts the day for anyone at a negative UTC offset — a date picked as the 25th reads back as the 24th in Los Angeles, and reminders fire early. The `timezone` column is captured but per-user delivery *timing* remains a Phase 5 concern, and the settings page says so.

Without `RESEND_API_KEY` every notification is written to the server log instead of sent, and the settings page tells the user that rather than pretending mail went out.

**Delivery respects the recipient's local hour.** Reminders only go out between 08:00–20:00 in the recipient's IANA timezone (falling back to UTC if none was ever captured); daily-nudge dedupe keys off their local calendar date too, so someone near the international date line can't be nudged twice as UTC rolls over mid-afternoon for them. `lib/dates.ts` centralizes every date/timezone calculation in the codebase — exam countdowns, dedupe windows, and delivery gating all go through it rather than ad hoc `date-fns` local-time calls, which is what caused the exam-date bug above in the first place.

## Backups

A nightly `node-cron` job (`03:15` by default, `BACKUP_CRON` to change, empty string to disable) runs SQLite's `VACUUM INTO` — not a raw file copy, which can catch a WAL write mid-flight — into `BACKUP_DIR` (defaults to `../../backups` from the server), and prunes snapshots older than `BACKUP_RETENTION_DAYS` (default 14). A test opens a produced snapshot as its own database and asserts the rows are actually readable back out, not just that a file appeared.

## End-to-end tests

`npm run e2e` builds the client, boots the real server against a throwaway `e2e.db`, and runs Playwright against it — registration, protected-route return-to, answering a quiz question, marking a flashcard, the low-confidence readiness badge, the exam planner, notification settings persistence, a full timed exam (withholds grading, blank-question confirmation, scored review), and the cert switcher. It exercises the actual Express app and content packs, not a mocked API.

## Gamification

XP for four actions (question answered +10, session completed +50, exam completed +200, flashcard marked known +2 — only on the transition into "known", so toggling can't farm it) and a daily streak, both counted across every certification rather than scoped to one exam.

**The race the spec warns about is real and closed by a transaction.** The naive version — read stats, conditionally modify, write back — lets two near-simultaneous requests (a double-submit, two open tabs) both read the same starting XP, so one write clobbers the other. `modules/gamification/service.ts` wraps the whole read-modify-write in `db.transaction()`, which better-sqlite3 executes under an exclusive lock. A test fires 20 concurrent awards for one user and asserts the XP and streak both land exactly once, not lost or double-counted.

The streak is triggered by the qualifying activity itself, not by login — a session can run for days without a fresh login event while the user studies daily inside it, so gating on login would silently freeze the streak for exactly that case. An `isSameUtcDay` guard (see the UTC note in Notifications above) makes repeated activity in one sitting safe: answer 50 questions today and XP accrues 50 times, but the streak moves once.

## Readiness confidence

A domain read as "100% mastery" off two correct answers is coin-flip noise wearing a precise-looking number. Below `CONFIDENT_ATTEMPTS` (8) answers, a domain's mastery is still shown — hiding it would be worse — but flagged `confident: false`, and the dashboard marks it `(thin)`. Once every exam-weighted domain clears the threshold, the overall readiness badge drops the "low confidence" tag. Verified against a real dashboard mid-session: 16% readiness, four of five domains marked thin, "roughly 19 more would make this trustworthy."

## Visual design

All colour lives as CSS custom properties in `apps/client/src/index.css` — one `:root` block for light, one `prefers-color-scheme: dark` block for dark. Nothing hardcodes a colour; components reference `var(--…)` or a Tailwind token mapped to one, so retheming is a single-file change.

**One mastery scale, everywhere.** `lib/mastery.ts` maps a percentage to `weak` / `developing` / `strong` (bands anchored on the 75% pass mark), and every gauge, label, and badge on the dashboard derives its colour from it. A colour therefore means the same thing wherever it appears, rather than each component picking its own.

**Primitives** in `components/ui/` are hand-rolled SVG with no charting dependency: `RadialGauge` (full donut or 270° gauge), `Sparkline` (optional dashed threshold line), `RankInsignia`, `StreakFlame`, `SegmentedProgress`. `Confetti` is ~50 lines of canvas rather than a package — this ships to a 1GB VM where every dependency is weight someone has to download and audit.

**Motion is opt-out.** Every animation is defined in one block in `index.css` and every one is disabled under `prefers-reduced-motion: reduce`, including the count-up on the readiness figure and the confetti, which simply never fires.

**Contrast is checked, not assumed.** Every foreground/background pair in both themes clears WCAG AA; the lowest is 4.59:1.

**Theming.** The toggle writes `data-theme` on `<html>`; the dark palette applies either under `prefers-color-scheme: dark` when no explicit choice is set, or under `[data-theme="dark"]` regardless of the OS. Choosing "system" removes the attribute rather than resolving it, so the OS preference keeps being tracked live. An inline script in `index.html` applies the saved choice before first paint — deferring that to React means a flash of the wrong theme on every load.

## Mobile & install

The web app is the mobile app: it's responsive down to 375px and installable to the home screen on iOS and Android via `manifest.webmanifest`, launching standalone with no browser chrome and no app store.

The service worker (`public/sw.js`) is deliberately small, with two rules. **It never touches `/api/*`** — those responses are per-user and session-scoped, and a cached authenticated response is a real hazard on a shared device. **Navigations are network-first**, with the cached shell as an offline fallback only; a cache-first shell is the well-worn way to leave users running last week's build. Content-hashed assets under `/assets/` are cached first, which is safe precisely because a changed file gets a new URL.

Mobile specifics worth knowing, since each was a real bug: inputs are 16px below the `md` breakpoint because Safari iOS force-zooms anything smaller on focus and never zooms back; `viewport-fit=cover` plus `env(safe-area-inset-*)` keeps content clear of the notch and home indicator; and the 44px touch-target floor applies only under `(hover: none) and (pointer: coarse)`, with inline prose links exempt.

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
