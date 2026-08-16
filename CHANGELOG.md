# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Versions are kept in lockstep across every workspace `package.json` (root + `apps/*` + `packages/*`).

## [1.3.0] — 2026-08-16

### Added
- **Theme toggle** — light / system / dark, in the sidebar, the mobile header, the marketing header, and the auth pages. Three-way rather than a binary flip: "follow the system" is a real preference, and a two-state toggle strands anyone whose phone switches theme at sunset. The choice persists in `localStorage` and is applied by a small inline script before first paint, so there's no flash of the wrong theme on load. Picking "system" removes the override entirely rather than resolving it to a value, so the OS preference keeps being tracked live.
- **Installable as a PWA** — web manifest, maskable and Apple touch icons, and a conservative service worker. Adds to the home screen on iOS and Android and launches standalone, with no app store involved.
- **Offline shell.** The service worker never caches `/api/*` — those responses are per-user and session-scoped, and a cached authenticated response is a hazard on a shared device. Navigations are network-first with the cached shell as a fallback only, which avoids the usual PWA trap of users running a stale build after every deploy. Content-hashed assets are cached aggressively, since a changed file is a different URL.

### Fixed
- **iOS zoomed the page on every input focus.** Safari force-zooms when a focused input's font-size is under 16px and never zooms back out; inputs were 14px. Now 16px on mobile, 14px from `md` up.
- **Content could sit under the notch and home indicator.** Added `viewport-fit=cover` with safe-area padding on the body, the mobile header, the main content area, and the level-up toast.
- Touch targets are held to a 44px minimum on touch devices only, so desktop density is unaffected. Inline links inside prose are exempt, where a 44px floor would wreck line spacing.
- Suppressed the grey tap-flash on touch devices and the page-level rubber-band scroll on iOS.

## [1.2.0] — 2026-08-16

### Changed
- **Visual identity.** New charcoal-and-brass palette in both light and dark themes, replacing the default grays. Every foreground/background pair in both themes clears WCAG AA (lowest ratio 4.59:1).
- **Readiness is now a gauge, not a number.** The dashboard's headline stat renders as a 270° radial gauge that counts up on load, coloured by a single mastery scale (`weak` / `developing` / `strong`) shared by every gauge, bar, and label on the page — so a colour means the same thing everywhere.
- **Per-domain mastery** moved from a stack of flat bars to banded radial gauges in a two-column grid, each labelled with its band rather than only a percentage.
- **Gamification has a face.** Levels render as a hexagonal rank insignia (chevrons accrue every fifth level), the streak as a flame that grows through five tiers and dims when today hasn't counted yet, and XP as a notched segmented bar instead of a flat fill.
- Favicon replaced with a hexagon-and-chevron mark matching the in-app insignia; added `theme-color` and a page description.

### Added
- **Score trend sparklines** — practice-session accuracy on the dashboard, and mock-exam scaled scores with a dashed pass-mark reference line. Both drawn from data the API already returned; no backend change.
- **Marketing hero preview** built from the real gauge and sparkline components (labelled "example"), so the homepage shows the actual UI rather than describing it and drifting out of date.
- Two delight moments, both reduced-motion aware: a canvas confetti burst on passing a mock exam (hand-rolled, no new dependency), and a level-up toast. A correct practice answer now pulses the choice you picked — only the one you picked, so a reveal on a wrong answer doesn't read as a reward.
- `prefers-reduced-motion` is honoured globally: every animation in the app is defined in one block in `index.css` and disabled together.

### Fixed
- Domain rows overflowed the viewport on narrow screens: as grid items they defaulted to `min-width: auto` and refused to shrink below the longest domain name, despite the truncation inside them.

## [1.1.0] — 2026-08-16

### Changed
- **Renamed the project to Drillhall** (was "CompTIA Prep"), including the GitHub repo, app title, header/sidebar branding, marketing page, email subject lines and sender name, `/api/meta`, and every deployment doc's example paths and service names.
- **Production domain moved to `drillhall.duckdns.org`** (was `comptiastudy.duckdns.org`).

### Added
- **Self-service account deletion** at `/settings` — cascades through every table with a `userId` foreign key (flashcard progress, quiz/exam history, exam dates, notification prefs) and removes the linked Google account row, which is how a user disconnects Google. Credential accounts confirm with their password; Google-only accounts fall back to Better Auth's session-freshness check.

## [1.0.0] — 2026-08-15

First public release.

### Added
- **Phase 1** — email/password auth, flashcards, multiple-choice quiz, reference sheets, dashboard, content validator, committed DB migrations with a boot-time fail-fast check, rate limiting, structured logging, `/health`, CI.
- **Phase 2** — second cert pack (A+ Core 2) proving the content schema generalizes, cert switcher, all three performance-based question engines (drag-to-order, drag-to-match, terminal command simulation), recency-weighted readiness scoring.
- **Phase 3** — public marketing homepage at `/`, password reset flow, friendlier auth errors, password visibility toggle, return-to-destination after login, verification-email resend.
- **Exam simulator** — five randomized, timed exam types (full mock, half mock, domain drill, PBQ gauntlet, weak-areas) with server-authoritative timing, CompTIA-style scaled scoring, flag-for-review, and per-session multiple-choice shuffling.
- **Phase 4** — exam planner (per-cert exam date + countdown), notification preferences page, an in-process `node-cron` scheduler for exam reminders, inactivity nudges, and a weekly digest.
- **Phase 5** — gamification (XP, streaks, levels) via a race-safe transaction, per-user timezone-aware notification delivery, nightly SQLite backup automation with retention pruning, a low-confidence indicator on readiness scores, Playwright end-to-end coverage.
- **Network+ (N10-009) and Security+ (SY0-701) content packs**, each grown to 180+ questions across their exam-weighted domains, joining the existing A+ Core 1 and Core 2 packs.
- Public GitHub repository.

### Fixed
- Practice-mode multiple-choice questions now shuffle option order per session (previously the correct answer sat in the same file-order position almost every time, since content is authored with the correct choice first).
- Exam drag-and-drop (order/match) answers are recorded on drop instead of being silently lost if the user navigated away first.
