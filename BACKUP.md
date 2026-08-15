# Backups

The entire application state is one SQLite file: `apps/server/data/app.db` (WAL mode).

## Snapshot (the safe way)

Never copy the file raw while the server runs — a mid-write copy can be corrupt. Use SQLite's backup command, which takes a consistent snapshot even under load:

```bash
sqlite3 /opt/comptia-platform/apps/server/data/app.db ".backup '/var/backups/comptia/app-$(date +%F).db'"
```

## Nightly cron

```bash
sudo mkdir -p /var/backups/comptia
crontab -e
```

```cron
# 03:15 nightly snapshot, keep 14 days
15 3 * * * sqlite3 /opt/comptia-platform/apps/server/data/app.db ".backup '/var/backups/comptia/app-$(date +\%F).db'" && find /var/backups/comptia -name 'app-*.db' -mtime +14 -delete
```

Optional encryption at rest (the DB holds email addresses and password hashes):

```cron
15 3 * * * sqlite3 .../app.db ".backup '/tmp/app.db'" && gpg --symmetric --cipher-algo AES256 --batch --passphrase-file /root/.backup-pass -o "/var/backups/comptia/app-$(date +\%F).db.gpg" /tmp/app.db && rm /tmp/app.db
```

## Restore

```bash
pm2 stop comptia            # or systemctl stop comptia
cp /var/backups/comptia/app-2026-08-14.db /opt/comptia-platform/apps/server/data/app.db
rm -f /opt/comptia-platform/apps/server/data/app.db-wal /opt/comptia-platform/apps/server/data/app.db-shm
pm2 start comptia
```

Then verify: `curl -f http://localhost:3001/health` and log in.

Test the restore path once now, not the first time you need it.
