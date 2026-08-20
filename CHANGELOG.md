# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Versions are kept in lockstep across every workspace `package.json` (root + `apps/*` + `packages/*`).

## [1.12.0] — 2026-08-20

### Added
- **Multiple-response questions ("Select TWO"), a new question type end to end.** The real CompTIA exams mix multi-select questions in with standard multiple choice, and the platform had no way to represent them. Added a `multi` type through the whole stack: content schema (`answerIndices`, validated for duplicates, range, and at least one wrong option), server grading (all-or-nothing — a partial selection *or* an over-selection both fail, matching the real exam), the per-session choice shuffle (so the correct pair isn't parked in the same slots every time), and a new client view that enforces the exact count the way the exam does — once `selectCount` boxes are ticked the remaining options disable, and Submit stays disabled until exactly that many are picked. Exam review renders both the picked set and the correct set.
  - Multiple-response is deliberately **not** treated as performance-based: the exam front-loads PBQs (ordering, matching, terminal), and a "Select TWO" question sits with standard multiple choice. `PBQ_ORDER` says so explicitly now rather than relying on a fallback.
- **28 multiple-response questions across all four packs, in every domain of every pack**, with a validator test that fails the build if any domain loses its coverage.
- **Question framing reworked toward how CompTIA actually asks.** New and revised questions use the operational frames the exam relies on — **FIRST** (correct troubleshooting order), **BEST/MOST likely** (several answers work, one fits practice/constraints), and **LEAST/negative** (find the exception) — and are written as the four scenario archetypes: troubleshooting helpdesk, systems architect under constraints, security incident from an indicator, and policy/compliance selection.
- **Network+ audited against the real N10-009 V9 objectives PDF** (the primary source, not a summary — the same treatment Core 1 and Core 2 got in 1.10.0/1.11.0). Gaps found and filled: an entire uncovered cluster in objective 1.8 (VXLAN/DCI, Zero Trust control vs. data plane, SASE/SSE, Infrastructure as Code) got a new lesson; IPsec's AH/ESP/IKE components, GRE-vs-IPsec, cloud internet/NAT gateways and security groups/lists, CDN/QoS/TTL, plenum cable, Fibre Channel, SVI, voice VLAN, prefix-length route selection, subinterfaces, BSSID/ESSID, band steering, 802.11h, captive portals, PSK-vs-Enterprise, MAC filtering, key management, and the CRC/runts/giants and err-disabled interface indicators were all missing or thin. The common-ports reference was completed with the nine objective-named ports it lacked (TFTP, NTP, LDAP, Syslog, SMTPS, LDAPS, SQL Server, SIP). Net: +1 lesson, +30 questions, +12 flashcards, +2 reference groups.
- **Security+ audited against the real SY0-701 V7 objectives PDF.** Two new lessons cover the largest uncovered clusters: reading indicators of malicious activity (impossible travel, concurrent sessions, out-of-cycle logging, missing logs, resource consumption vs. inaccessibility, reflected vs. amplified DDoS, environmental attacks) and vulnerability management end to end (identification methods, false positive vs. false negative, CVE vs. CVSS, benchmarks/SCAP, alert tuning, UBA, secure cookies, package monitoring). Also filled: honeyfile/honeytoken, threat scope reduction, brand impersonation, misinformation vs. disinformation, responsibility matrix, risk transference, journaling/replication, identity proofing, ephemeral credentials, responsible disclosure, key risk indicators, risk threshold, conflict of interest, MOA, loss of license, audit committee, and anomalous behavior recognition. Net: +2 lessons, +38 questions, +18 flashcards, +4 reference groups.

### Fixed
- **The exam's PBQ-ordering test asserted "not multiple choice" meant "performance-based"** — an assumption that only held while `mc` was the sole non-PBQ type. It now checks the three interactive types explicitly, so adding a discrete question type can't silently break the front-loading guarantee.

## [1.11.2] — 2026-08-20

### Added
- **Reset progress for one cert**, at `/settings`, alongside the full reset added in 1.11.1. Pick a cert from a dropdown and clear only its quiz/exam history, flashcard status, and course read/flag state — every other cert stays exactly as it was. XP, level, and streaks are cross-cert by design (they track study habit, not one exam), so a single-cert reset never touches them, same as the full reset. New route `POST /api/settings/reset-progress/:certId`, scoped in one transaction the same way the all-certs version is.

## [1.11.1] — 2026-08-20

### Added
- **Reset all progress**, at `/settings`. Wipes XP, level, and streaks back to day one and clears every quiz/exam attempt, flashcard status, and course read/flag state across all four certs — a full "start from scratch" without touching the account itself, notification preferences, or a booked exam date. Same destructive-action UX as account deletion (click to reveal, explicit confirm, no undo), scoped server-side in one transaction so a mid-way failure can't leave some tables cleared and others not.

### Fixed
- **A newly added Core 2 match question could grade a genuinely wrong answer as correct.** `core2-match-008` (MFA factor categories) paired two different lefts to the identical right-hand text "Something you have" — since grading checks each left against its own correct right independently, swapping those two specific rows produced an assignment indistinguishable from the correct one. Gave each row distinct right-hand text; audited every match question in all four packs for the same duplicate-right pattern and found no other instances.

## [1.11.0] — 2026-08-19

### Added
- **Line-by-line audit of A+ Core 2 against CompTIA's actual official 220-1202 V15 objectives document** (the real PDF, all 24 sub-objectives across four domains) — the same treatment v1.10.0 gave Core 1. Found real gaps a summary-based pass had missed:
  - Domain weights were off: the pack had been running 31/25/22/22, corrected to the real V15 split 28/28/23/21 (Operating Systems / Security / Software Troubleshooting / Operational Procedures).
  - Four sub-objectives had no coverage at all: 1.11 (Chrome OS, ext4/XFS, cloud productivity suites — identity sync, licensing assignment), 2.10/2.11 (SOHO router hardening — UPnP, screened subnet, port forwarding, guest access — and browser security — secure DNS, password managers, pop-up/ad blockers), 4.8 (scripting file types and their risks — .bat/.ps1/.vbs/.sh/.js/.py), 4.9 (remote access technologies — RDP/VNC/SSH/RMM/SPICE/WinRM), and 4.10 (AI basics — hallucination, bias, private-vs-public data). Added 6 new lessons covering all of them.
  - Named terms with no coverage anywhere: fileless malware, boot sector virus, stalkerware, QR code phishing ("quishing"), RSR (Apple Rapid Security Response), SAML, JIT/PAM access, IAM, directory services, and the full MFA factor breakdown (hardware token, authenticator app/TOTP, SMS, voice call, email code) beyond just "something you know/have/are" in the abstract.
  - Net: +6 lessons, +27 quiz questions, +7 flashcards, +4 reference groups (scripting file types, remote access tools, SOHO/browser security settings, identity & access terms), all schema-validated.

This closes out the primary-source audit pass across both A+ packs — same method as v1.10.0, applied to Core 2. Network+ and Security+ have only had the earlier web-summary audit (v1.9.0); a primary-source PDF pass for those is a candidate for later, not yet requested.

## [1.10.0] — 2026-08-19

### Fixed
- **A+ Core 1 and Core 2 were labeled with retired exam codes.** The platform showed "220-1101"/"220-1102" everywhere (marketing page, cert switcher, exam simulator) — CompTIA retired both on September 25, 2025, replacing them with 220-1201/220-1202 back in March 2025. Every candidate today sits the 1201/1202 exams; the platform had been silently out of date for almost a year. Updated `cert.json` for both packs, plus every hardcoded reference in tests and docs.

### Added
- **Line-by-line audit of A+ Core 1 against CompTIA's actual official 220-1201 V15 objectives document** (not a web summary this time — the real PDF, all 20 sub-objectives). Found real gaps the earlier summary-based audit missed:
  - An entire objective (2.3, server roles and internet appliances — DNS/DHCP/fileshare/mail/syslog/web/AAA/database/NTP servers, spam gateways, UTM, load balancers, proxies, SCADA, IoT) had zero coverage. Added a full lesson plus a new reference sheet.
  - Objective 3.7 (deploying/configuring printers — PCL vs. PostScript, badging, secured prints, network scan services) was conflated with 3.8's maintenance content and never actually covered on its own. Added a dedicated lesson.
  - Named items with no coverage anywhere: RFID, RAID 6, mSATA, SAS as a real interface (not just a distractor), Mini-LED, T568A/T568B, DB9, Molex, direct burial cable, ONT, WISP, multisocket, HSM, DKIM/SPF/DMARC, community cloud, multitenancy, ingress/egress, file synchronization, and printer finishing issues (staple jams, hole punch). Projector-specific troubleshooting was down to a single question against seven named symptoms in the objective.
  - Net: +2 lessons, +27 quiz questions, +7 flashcards, +3 reference groups, all schema-validated.

This is the same audit method as v1.9.0's four-pack pass, just against a primary source instead of a paraphrase — worth doing again whenever CompTIA republishes an objectives document, since a summary can drift from what's actually tested even when it looks complete.

## [1.9.0] — 2026-08-19

### Added
- **Full content audit and expansion across all four cert packs**, triggered by a Linux command-line question appearing in an A+ Core 1 quiz with no course material to back it up. Every pack was checked question-by-question and lesson-by-lesson against CompTIA's official objectives:
  - **A+ Core 1** — corrected domain weights to match the real V15 split (13/23/25/11/28%). Removed 7 quiz questions that tested Windows/Linux command-line syntax, which is a Core 2 objective, not Core 1's — Core 1's course never taught it, so those questions could only ever be guessed. Added 4 new lessons (SOHO networks & VPNs, peripherals, virtualization concepts, the physical troubleshooting toolkit) plus matching quiz/flashcard/reference content.
  - **A+ Core 2** — macOS and mobile-OS coverage were thin relative to Windows despite being named objectives; extended the OS lifecycle lesson with real macOS tools (FileVault, Force Quit, Migration Assistant, Gatekeeper) and mobile-OS content (OTA updates, factory reset, iOS vs Android, MDM), plus a new "macOS Tools" reference sheet.
  - **Network+** — Network Security (14%) was the thinnest domain; added two lessons covering CIA triad/risk terminology/PKI/IAM/SSO/SAML and compliance/OT segmentation/honeypots/social engineering. Filled smaller gaps across every other domain too: address classes, appliance categories, connectors/media, BGP/EIGRP, jumbo frames, power/environmental installation factors, SLAAC/PTP/NTS, MTBF, port mirroring, EOL/EOS lifecycle.
  - **Security+** — Security Operations (28%, the largest domain) had a solid quiz bank but almost no course backing; added two lessons covering automation/orchestration (previously absent entirely), BYOD/CYOD, privileged access management, XDR, and SAML/OAuth. Also added lessons for the missing PKI/cryptography stack, named vulnerability categories (memory injection, VM escape), hardware roots of trust (TPM, secure enclave), and compliance frameworks (PCI DSS, HIPAA, ISO 27001) — plus Security Architecture's first reference sheet, since it had none.
  - Net: +21 course lessons, +54 quiz questions, +32 flashcards, +14 reference groups across the four packs, all schema-validated and covered by the content package's own test suite.

### Fixed
- **Client bundle exceeded Vite's 500 kB chunk-size warning.** Every route was eagerly bundled into one ~1 MB JS file. Split every authenticated route (Dashboard, Course, Flashcards, Quiz, Exam, Reference, Settings, Admin) into its own lazy-loaded chunk via `React.lazy`/`Suspense` — marketing and auth pages stay eager since they're a signed-out visitor's first load. No route now exceeds ~435 kB, and a session only downloads the feature areas it actually visits.

## [1.8.1] — 2026-08-19

### Fixed
- **Flag-for-review button caused the lesson page's action row to wrap and jump.** The full-width "Flag for review" / "Flagged for review" text button changed width between states, which could push it (and the Previous/Next buttons) past the row's available space and onto a new line only in one of the two states — a layout jump on toggle. Replaced with a fixed-size icon-only toggle (flag icon, `aria-label` + native tooltip for the state) that's the same width flagged or not.

## [1.8.0] — 2026-08-18

### Added
- **Flag a lesson "needs more study."** A new toggle on every course lesson, independent of read state — flag it whether you've read it or not, come back to it later. Flagged lessons show a small flag icon in the Course index list, right next to the title, so you can scan a domain and see what still needs another pass. Backed by its own `course_flags` table rather than a column on `course_progress`, deliberately: that table's row existence is the XP-award guard for reading a lesson, and a flag on an unread lesson would otherwise create a row early and silently block the XP it should still earn once actually marked read.

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
