# Deployment

Target: your Linux VM, reached over Tailscale. No ports exposed to the internet, no TLS to manage.

## 1. One-time setup

```bash
# on the VM
git clone <repo> /opt/drillhall
cd /opt/drillhall
npm ci
cp .env.example .env    # fill in — see SECRETS.md
npm run build
npm run db:migrate
```

Set in `.env`:

- `BETTER_AUTH_SECRET` — required, `openssl rand -base64 32`
- `BETTER_AUTH_URL` — what browsers hit, e.g. `http://your-vm.tailnet-name.ts.net:3001`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional; redirect URI must be `<BETTER_AUTH_URL>/api/auth/callback/google`
- `RESEND_API_KEY` — optional; emails log to stdout without it

## 2. Process manager

### pm2

```bash
npm i -g pm2
cd /opt/drillhall
NODE_ENV=production pm2 start npm --name drillhall -- start
pm2 save && pm2 startup
```

### systemd (alternative)

`/etc/systemd/system/drillhall.service`:

```ini
[Unit]
Description=Drillhall
After=network.target

[Service]
WorkingDirectory=/opt/drillhall
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure
User=drillhall

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now drillhall
```

Health check for either: `curl -f http://localhost:3001/health` (200 + DB ping). Wire it into pm2's health monitoring or a systemd watchdog if you want auto-restart on DB failure.

Single instance only — the Phase 4 notification scheduler assumes one process (spec §6). Do not run a pm2 cluster.

## 3. Tailscale onboarding (per friend)

1. Tailscale admin console → invite their account (or share the node).
2. They install Tailscale, join your tailnet.
3. Send them `http://<vm-tailscale-name>:3001` — they register with email or Google.

## 4. Updating

```bash
cd /opt/drillhall
git pull
npm ci
npm run build
npm run db:migrate     # server refuses to boot if you forget this — that's intentional
pm2 restart drillhall    # or: sudo systemctl restart drillhall
```

## 5. Logs

Structured JSON on stdout (pino, request IDs per request). With pm2: `pm2 logs drillhall`. With systemd: `journalctl -u drillhall -f`. Pipe through `npx pino-pretty` when reading by hand.

## Docker (optional, untested path)

`docker-compose.yml` builds and runs the same thing with `./data` volume-mounted. The pm2/systemd path above is the verified one; treat compose as a starting point.
