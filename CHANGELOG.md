# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Versions are kept in lockstep across every workspace `package.json` (root + `apps/*` + `packages/*`).

## [1.7.0] — 2026-08-18

### Added
- **Confetti on milestones, not just exam passes.** Streak milestones (7/30/100/365 days) and level milestones (5/10/25/50/100) now trigger a burst on the dashboard, sized to the achievement — a 7-day streak reads smaller than a 100-day one. A perfect quiz score (100%) now bursts too. Exam-pass confetti got bigger to stay the biggest moment in the app. New shared `useMilestone`/`useOneShot` hooks (`apps/client/src/lib/milestones.ts`) detect a threshold crossing exactly once per browser, and stay silent on the very first load of the feature — nobody gets congratulated for a streak they reached months ago the instant this ships.

## [1.6.0] — 2026-08-18

### Added
- **Admin panel** at `/admin`, gated on a `role` field on the user. Built on Better Auth's official admin plugin rather than hand-rolled role checks — authorization is precisely the code worth not writing yourself, and the plugin already handles revoking a banned user's live sessions and refusing self-lockout. List and search users, ban/unban, promote/demote, force sign-out, delete, and **set a password directly** — which matters here because this instance has no outbound email, so the normal reset link goes nowhere; this is the working recovery path. The nav item only renders for admins, but that's cosmetic: every action is authorized server-side, and non-admin routes 404 rather than 403 so the surface doesn't confirm its own existence.
- **Promotion is deliberately not possible inside the app.** The first admin is set out of band via `scripts/grant-admin.mjs <email>`; after that an existing admin can promote others. If any signed-in user could reach an endpoint that made them an admin, the gate would be decorative.
- **Visual overhaul.** A two-part elevation scale (contact + ambient shadow, since one blurred shadow reads as a smudge rather than height), brass gradients on primary actions and progress fills, a soft page wash, hover-lift on cards and press-response on buttons, staggered card entrances, XP-bar shimmer, a self-drawing checkmark on correct answers, and rising embers on established streaks.
- **A real 3D flashcard flip** — perspective and `rotateY` with both faces rendered and back-face-hidden, replacing the previous text swap. Faces share a grid cell so the card sizes to the taller side and never jumps height mid-turn.
- **A second accent hue (teal)** marking *content* — course lessons, reference material — so it reads apart from brass, which now means progress and achievement exclusively.
- **Illustrated empty states** for quizzes, exams and courses, plus **per-certification badge marks** (a chip for hardware, a node graph for networking, a padlock for security) in the switcher and on the marketing cards.

### Fixed
- **"Got it" advanced two flashcards instead of one** whenever *Hide known* was on. Marking a card known removes it from the filtered deck, which shifts every later card back one slot — so the next card already arrived at the current index, and incrementing on top of that stepped straight over it. Reported from production with a screenshot; reproduced, fixed, and verified by walking a known card order and asserting the exact card landed on.

### Changed
- Every new colour pair in both themes was contrast-checked rather than eyeballed; all clear WCAG AA.

## [1.5.0] — 2026-08-16

### Added
- **Unmark a lesson as read.** Previously a completed lesson had no way back — the "Mark as read" button just turned into "Test it" permanently. A lesson can now be unmarked ("needs more studying?"), which drops it from the dashboard's read count and the domain progress ring, and shows "Mark as read" again on the lesson page. `course_progress` gained a `read` boolean (migration `0006`); the row itself, and the XP it earned, are never deleted or clawed back — only the current flag flips. That's deliberate: XP rewards the effort already made, matching how flashcards' known/learning toggle already works here, and it closes an XP-farming loop that a delete-based unmark would have opened (mark → unmark → remark could otherwise repeat the +15 forever). Guarded by row *existence*, not the read flag, so a remark after unmarking never re-pays it — covered by a dedicated test that walks the full mark → unmark → remark cycle and asserts XP at every step.

## [1.4.1] — 2026-08-16

### Added
- **Course content for the remaining three packs.** A+ Core 2 (9 lessons), Network+ (11), and Security+ (10), matching the depth and house style of the A+ Core 1 course that shipped in 1.4.0. All four packs validate against `CertPackSchema` — correct ids, correct domain codes, domain weights still summing to 100 — and the full server (117) and content (9) suites pass. Every pack now shows real content instead of the Course page's empty state.

## [1.4.0] — 2026-08-16

### Added
- **Course** — a reading-based study track, a fifth part of each content pack (`course.json`), domain-tagged like everything else. A new **Course** nav item, a domain-grouped index with per-domain progress rings, and a markdown lesson reader (`react-markdown`, never `innerHTML`). Lessons are browsable, not gated or sequenced — matching how flashcards, quiz, and reference already work. Completing a lesson awards XP once (guarded against re-farming) and offers a one-tap jump into a domain-filtered quiz. Video was deliberately left out of the schema for now rather than stubbed. A+ Core 1 shipped with a full course; the other three packs followed in 1.4.1.
- **Course-vs-mastery cross-reference** on the dashboard — shows what you've *read* beside what you've *proven* with a quiz answer, per domain, and flags the gap ("quiz it →") where a domain is well-read but thinly tested. Kept separate from the readiness gauge, since reading isn't evidence of mastery — the same call already made for mock exams.

### Fixed
- **Flashcard shuffle did nothing.** The seeded-shuffle hash folded the seed in once and then multiplied it by 31 per character; because every card id is the same length, that made the seed an identical constant offset for every card, which cancelled out in the sort and left the original order untouched. Replaced with a hash that mixes the seed through each byte with an avalanche step, so it produces a genuine, seed-dependent order while staying deterministic (which the new position-persistence relies on).
- **Flashcard position is now remembered, server-side.** Your domain filter, shuffle state, and exact place in the deck persist across reloads and follow you across devices — stored as `{seed, index, filters}`, which reconstructs the exact deck because the shuffle is deterministic. The Shuffle button is now a two-way toggle (Shuffle ⇄ Original order) rather than a one-way re-roll.

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
