# CompTIA Prep

Self-hosted, multi-user CompTIA exam prep platform. React + Vite client, Express + better-sqlite3 server, Better Auth (email/password + Google), content shipped as validated data packs.

**Status: Phase 1 complete** (see `comptia-platform-build-spec.md` §13 for the phase plan):
single cert (A+ Core 1), auth, flashcards, MC quiz, reference sheets, dashboard, content validator, committed migrations + boot-time fail-fast check, rate limiting, structured logging, `/health`, CI.

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

Edit `packages/content/aplus/*.json`, then `npm run validate`. A new cert = a new folder with `cert.json`, `domains.json`, `flashcards.json`, `quiz.json`, `reference.json` — zero component changes (engines render whatever pack is loaded; multi-cert UI lands in Phase 2).

## Auth notes

- `better-auth` is pinned exact (spec §3); the Drizzle adapter ships inside the core package.
- `apps/server/src/db/auth-schema.ts` is CLI-generated (`npx @better-auth/cli generate --config src/lib/auth-cli-config.ts`). Re-run it only when the auth config changes, then `npm run db:generate` and commit both.
