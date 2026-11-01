---
title: Backup and restore
description: Host choice, automated SQLite backups with restic, restore runbook, and restore drills.
---

This guide complements [Deployment](/docs/guides/advanced/deployment/). Backups are **external** to the SampleDB process: you run them on a schedule from a trusted host with `sqlite3`, `restic`, and access to the database file (or a pipe from the container/VM).

## Choosing where to run production


|                   | **Docker on a lab VM / server**                                    | **fly.io**                                                                          |
| ----------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Best for**      | Full control, predictable backups from the host, typical lab setup | Managed platform, fewer servers to patch                                            |
| **SQLite file**   | Bind mount on host (e.g. `/var/lib/sampledb/sampledb.sqlite`)      | Persistent volume at `/data/sampledb.sqlite`                                        |
| **Backup runner** | Cron/systemd on same host or backup server with NFS/SSH to DB path | Your laptop, CI, or a small VM running `fly ssh console` and piping to local restic |
| **RPO**           | Hourly/daily via schedule                                          | Same, unless you add continuous replication (e.g. Litestream)                       |
| **Scaling**       | Single instance writing one DB file                                | Single machine + volume only; do not run multiple writers                           |


**Recommendation for most labs:** run production with **Docker Compose on a dedicated Linux host**, put the database on a persistent host directory, and run `**ops/backup/backup-db-restic.sh`** from that host (or from a backup host that can read the file). Use **off-site** restic storage (S3, B2, MinIO, etc.).

## Prerequisites

- **sqlite3** (online backup via `.backup` to a temp file in the script; `$TMPDIR` must have space ≥ DB size)
- **restic** initialized once: `restic init` against your `RESTIC_REPOSITORY`
- Environment: `DATABASE_PATH`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` (see `ops/backup/backup.env.example`)
- Optional second repo: set `RESTIC_COPY_REPOSITORY` and `restic init` that location too (`restic copy` needs restic 0.12+)

## Automated backup (Docker bind mount)

On the host where the DB file lives:

```bash
cd /path/to/sampledb   # repo clone optional; script is self-contained
export DATABASE_PATH=/var/lib/sampledb/sampledb.sqlite
set -a && source /path/to/ops/backup/backup.env && set +a
./ops/backup/backup-db-restic.sh
```

Copy `ops/backup/backup.env.example` to `backup.env`, fill in values, and **never commit** `backup.env`.

Optional: after each backup, apply retention (14 daily / 12 weekly / 60 monthly) by setting `RUN_RESTIC_FORGET=1` in `backup.env` (or run `restic forget` on a separate weekly timer).

### systemd (timer)

Run as a dedicated user that can read `DATABASE_PATH`. Store secrets in a root-only file, e.g. `/etc/sampledb/backup.env`.

`**/etc/systemd/system/sampledb-backup.service`**

```ini
[Unit]
Description=SampleDB SQLite backup to restic
After=network-online.target

[Service]
Type=oneshot
User=sampledb-backup
Group=sampledb-backup
EnvironmentFile=/etc/sampledb/backup.env
ExecStart=/opt/sampledb/ops/backup/backup-db-restic.sh
```

`**/etc/systemd/system/sampledb-backup.timer**`

```ini
[Unit]
Description=SampleDB backup timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sampledb-backup.timer
```

Adjust `OnCalendar` (e.g. `hourly` or `*-*-* 02:30:00`) to match your RPO.

### cron

```bash
30 2 * * * set -a; . /etc/sampledb/backup.env; set +a; /opt/sampledb/ops/backup/backup-db-restic.sh >> /var/log/sampledb-backup.log 2>&1
```

### Optional second repository

To replicate snapshots after each successful backup, set `RESTIC_COPY_REPOSITORY` in `backup.env` (for example `local:/mnt/offsite/sampledb-restic`). Initialize that repo once:

```bash
set -a && source /path/to/ops/backup/backup.env && set +a
RESTIC_REPOSITORY="$RESTIC_COPY_REPOSITORY" restic init
```

The script then runs `restic copy` from `RESTIC_REPOSITORY` to `RESTIC_COPY_REPOSITORY`. If `RUN_RESTIC_FORGET=1`, forget/prune runs on both repos.

Do not add the copy dest to systemd `RequiresMountsFor` on the backup unit. If that mount is down, systemd skips the whole unit and you miss the local snapshot. A failed copy still exits non-zero after the local snapshot is stored, so you still get an alert.

### Named Docker volume (no host path)

If the DB is only inside a container:

```bash
docker exec sampledb3 sh -c 'f=$(mktemp) && sqlite3 /data/sampledb.sqlite ".backup $f" && cat "$f" && rm -f "$f"' | \
  restic backup --stdin --stdin-filename sampledb.sqlite --tag sampledb
```

### fly.io

From a machine with `fly` and `restic` configured:

```bash
fly ssh console -a YOUR_APP -C 'f=$(mktemp) && sqlite3 /data/sampledb.sqlite ".backup $f" && cat "$f" && rm -f "$f"' | \
  restic backup --stdin --stdin-filename sampledb.sqlite --tag sampledb
```

For lower RPO on Fly, consider **Litestream** (or similar) to object storage in addition to periodic restic snapshots.

## Copy before schema migrations

Restic snapshots run on a schedule, so the newest one may be hours old when you upgrade. To cover upgrades, SampleDB copies the database itself when it starts on a database whose schema is older than the new version, before it changes anything:

- **Where:** next to the database file, named `<file>.pre-v<version>-<UTC timestamp>.bak`, for example `/var/lib/sampledb/sampledb.sqlite.pre-v11-20261101T143005123Z.bak` (Docker bind mount) or `/data/sampledb.sqlite.pre-v11-….bak` (fly.io). `<version>` is the schema version the upgrade moves to; the copy holds the version from before the upgrade.
- **When:** only when a migration is pending. Restarting on the same version writes nothing. The startup log prints the path.
- **Space:** the copy is about the size of the database, so the directory needs free space for it.
- **If it fails:** startup stops with `Could not back up … before running schema migrations` and leaves the database unchanged. Make the directory writable or free space, then start again.

SampleDB never deletes these copies. Keep the newest one until you've checked the upgraded app (log in, open a recent study and its containers) and the next restic backup has run, then delete it:

```bash
ls -lh /var/lib/sampledb/*.bak
rm /var/lib/sampledb/sampledb.sqlite.pre-v11-20261101T143005123Z.bak
```

To undo an upgrade with the copy, stop SampleDB, deploy the previous image (the new one would migrate the copy again), and follow step 5 below, using the `.bak` file in place of the restic restore. A restic backup taken while the copy exists may include it if your script backs up the whole directory; `ops/backup/backup-db-restic.sh` backs up only `DATABASE_PATH`.

## Restore runbook

Use this when recovering from corruption, bad migration, or lost host.

### 1. Stop SampleDB

Avoid any writer touching the SQLite file while you replace it.

- **Docker:** `docker compose stop sampledb3` (or stop the service on the host).
- **fly.io:** scale to 0 or stop the machine so nothing writes to `/data`.

### 2. List and pick a snapshot

```bash
export RESTIC_REPOSITORY=... RESTIC_PASSWORD=...
restic snapshots --tag sampledb
```

Choose a snapshot ID (or use `latest` after verifying tags).

### 3. Restore to a temporary directory

```bash
sudo mkdir -p /tmp/sampledb-restore
sudo restic restore SNAPSHOT_ID --tag sampledb --target /tmp/sampledb-restore
```

The file will appear as `/tmp/sampledb-restore/sampledb.sqlite` (path matches `--stdin-filename` used at backup time).

### 4. Verify the file (strongly recommended)

```bash
sqlite3 /tmp/sampledb-restore/sampledb.sqlite "PRAGMA integrity_check;"
```

Expect a single line `ok`. If not, try an older snapshot.

### 5. Install as the live database

- **Docker bind mount:** copy the restored file over the live path (keep a copy of the current broken file first if needed):
  ```bash
  sudo cp /var/lib/sampledb/sampledb.sqlite /var/lib/sampledb/sampledb.sqlite.broken-$(date +%Y%m%d)
  sudo cp /tmp/sampledb-restore/sampledb.sqlite /var/lib/sampledb/sampledb.sqlite
  sudo chown ...   # match the user/container that owns the file
  ```
- **fly.io:** `fly ssh console`, then replace `/data/sampledb.sqlite` using `scp`/`sftp` or upload from a trusted machine per Fly docs.

### 6. Start SampleDB and verify

- Start the app.
- Log in, open a known study/specimen, confirm recent data matches expectations for that snapshot’s age.

## Restore drill checklist (quarterly)

Do this in a **non-production** clone or a disposable restic repo first if possible.

1. [ ] Confirm `restic snapshots --tag sampledb` shows recent snapshots.
2. [ ] Restore `latest` to `/tmp/drill-restore-$(date +%s)`.
3. [ ] Run `PRAGMA integrity_check` on the restored file.
4. [ ] Document how long restore took and fix any gaps (permissions, paths, env).
5. [ ] Update this runbook if steps changed.

## Monitoring and alerts

- Alert if the backup job **fails** (non-zero exit from cron/systemd).
- Alert if **no new snapshot** in restic for longer than your RPO (e.g. parse `restic snapshots --json` or check snapshot dates).
- Run `restic check` periodically (weekly/monthly) to verify repository integrity.

## GitHub Actions (optional)

Run backups from CI only if the runner can reach the database (usually **not** true for a private lab DB). Typical pattern: self-hosted runner on the lab network, or backup from the app host via systemd instead. If you use a self-hosted runner, mirror the same env vars and invoke `ops/backup/backup-db-restic.sh`.

## Rationale (temp file vs piping)

The backup script uses SQLite’s online `.backup` into a file under `$TMPDIR`, then feeds that file to restic on stdin. Piping `.backup` straight to restic is fragile: on some systems `.backup stdout` targets a real file named `stdout`, and `.backup /dev/stdout` can fail when stdout is already a pipe. The temp-file approach behaves consistently on Linux and macOS; the trade-off is temporary disk space ≈ database size during the run.