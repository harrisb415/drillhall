# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Versions are kept in lockstep across every workspace `package.json` (root + `apps/*` + `packages/*`).

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
