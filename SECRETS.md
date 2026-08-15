# Secrets

All secrets live in `.env` at the repo root (gitignored). Never commit any of them. `.env.example` documents the full set.

| Secret | Where it comes from | Rotation |
|---|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | Generate a new value, restart. All sessions are invalidated — users just log in again. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client (Web application). Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google` | Console → the OAuth client → reset secret → update `.env` → restart. Existing linked accounts keep working (links are by Google account id, not the secret). |
| `RESEND_API_KEY` | resend.com dashboard → API Keys | Create new key, update `.env`, restart, delete old key. |

## Rules

- The server refuses to start in production without `BETTER_AUTH_SECRET`.
- `.env` should be readable only by the service user: `chmod 600 .env`.
- If a secret leaks (pasted in chat, committed by accident), rotate it immediately — for a git commit, rotate first, then scrub history if you care.
- Backups may be stored off-VM; they contain email addresses and password hashes but no secrets (secrets live only in `.env`, which is not part of the backup set — keep a copy of `.env` somewhere safe separately, e.g. a password manager).
