---
title: Deployment
description: Deploy SampleDB with Docker, docker-compose, or fly.io
---

SampleDB can be deployed using Docker or fly.io. Backups are **external** to the application—you run them on your own schedule (cron, systemd timer, etc.).

**Where to run production:** For most labs, **Docker Compose on a dedicated host** with a bind-mounted database path is the simplest way to get reliable file access for backups. **fly.io** works for a single machine + volume; backups often run from another machine piping `fly ssh console` into restic. See [Backup and restore](/docs/guides/advanced/backup-and-restore/) for comparison, restore runbook, and restore drills.

## Docker

### Build and run

The repo `docker-compose.yml` pins a published image on `ghcr.io` (see the `image:` lines for the current tag). Run `docker compose pull` before starting, or `docker compose up` will fetch the image. If the org’s GHCR package is private, `docker login ghcr.io` first with a token that includes `read:packages`.

**Bleeding edge (pre-release):** Every push to the default branch **rebuilds and moves** a single `nightly` tag in GHCR—there is no long-lived per-commit name for `main` builds, so the registry does not keep a full history of nightlies (old digests become **untagged** and are pruned in the background on a schedule). For **stable** production deploys, use a **versioned** image from a GitHub release (semver tags, `latest`, and release `sha-*` are all retained). Set `image:` to e.g. `ghcr.io/<org>/<repo>:nightly` to always pull the current `main` build, or a semver tag to pin a release.

To build the image from source instead, add a `docker-compose.override.yml` (or a separate compose file) that sets `build: .` and removes the `image:` for the `sampledb` and `demo-seed` services, then run the same commands below.

Optional: copy `.env.example` from the repo root to `.env` and adjust variables; `docker compose` reads `.env` automatically.

```bash
cp .env.example .env   # optional
docker compose pull
docker compose up -d
```

The app listens on port 3000. The SQLite database is stored in `HOST_DATA_DIR` (default `./data`) on the host.

The API serves the frontend and uses SPA fallback: reloading or opening subpages (e.g. `/locations/123`) directly returns `index.html` so React Router can handle client-side routing. The user guide documentation is served at `/docs`.

### Deployment configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST_DATA_DIR` | `./data` | Host path for the database. Bind-mounted at `/data`. Set to e.g. `/var/lib/sampledb` to store elsewhere. |
| `PORT` | `3000` | Host port to expose. Use when 3000 is already in use. |
| `DATABASE_PATH` | `/data/sampledb.sqlite` | Path to SQLite inside the container. Must match the mount path. |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | **Required in production.** Comma-separated CORS origins (e.g. `https://your-domain.com`). If unset, CORS rejects all cross-origin requests. |
| `ERROR_LOG_ENABLED` | `true` | Enable error logging to the database. Set to `false` or `0` to disable. If disabled, a startup warning is logged. |
| `ERROR_LOG_LEVEL` | `error` | Minimum level: `info`, `warning`, `error`. |
| `ERROR_LOG_RETENTION_DAYS` | — | Days to retain error logs before cleanup. |
| `OPENAPI_ENABLED` | `false` (in prod) | Set to `true` to expose OpenAPI docs at `/api/docs` in production. |

The database lives at `$HOST_DATA_DIR/sampledb.sqlite` on the host, so your backup script can read it directly when run from cron or systemd.

For existing databases created before the error-logging feature, the `error_logs` table is created automatically on startup when missing. No manual migration is needed.

### Seeding a demo database (Docker)

To populate the database with demo data before starting the app:

```bash
docker compose run --rm demo-seed
docker compose up -d
```

The seed writes to the main DB file (`/data/sampledb.sqlite`). Admin login: `admin` / `DemoAdmin1!`

See [Generating a Demo Database](/docs/guides/getting-started/demo-database/) for details.

## fly.io

See `fly.toml` in the repo root for a reference configuration. To deploy:

1. Run `fly launch --no-deploy` to create the app
2. Create a volume: `fly volumes create sampledb_data -r <region>`
3. Update `ALLOWED_ORIGINS` in `fly.toml` to your app URL (e.g. `https://<app-name>.fly.dev`)
4. Deploy: `fly deploy`

### fly.io secrets

**App secrets:** None required. All configuration is in `[env]` in `fly.toml`.

### Seeding a demo database (fly.io)

After deploying, run the seed script on the app machine:

```bash
fly ssh console -C "bun /app/packages/api/dist/lib/demo-seed.js"
```

The app must be running. Refresh the browser to see the demo data. See [Generating a Demo Database](/docs/guides/getting-started/demo-database/) for details.

**Backup secrets:** Backup runs externally (your machine, GitHub Actions, etc.). Set these in that environment, not as fly.io secrets:

| Secret | When to set | Where |
|--------|-------------|-------|
| `RESTIC_PASSWORD` | Always (restic encryption) | GitHub Actions secrets, or `backup.env` on your backup host |
| `RESTIC_REPOSITORY` | Always (backup destination) | Same as above |
| `AWS_ACCESS_KEY_ID` | When using S3/S3-compatible | Same as above |
| `AWS_SECRET_ACCESS_KEY` | When using S3/S3-compatible | Same as above |
| `AWS_DEFAULT_REGION` | When using S3/S3-compatible | Same as above |

---

## Backup

Backup is **fully external** to the app. Versioned automation lives under **`ops/backup/`** (the repo root `scripts/` folder is gitignored for local scripts).

Full runbook, systemd/cron examples, and quarterly restore drills: [Backup and restore](/docs/guides/advanced/backup-and-restore/).

### Backup script

The repo includes `ops/backup/backup-db-restic.sh`. It runs SQLite’s online `.backup` into a **temporary file** under `$TMPDIR`, then streams that file into `restic backup --stdin` so restores always see `sampledb.sqlite`. Ensure `$TMPDIR` has free space ≥ database size during the run.

**Requirements:** `restic`, `sqlite3` (3.34+), and env vars: `DATABASE_PATH`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`.

### How to access the SQLite file

**docker-compose** (default bind mount `./data` or `$HOST_DATA_DIR`):

```bash
export DATABASE_PATH=${HOST_DATA_DIR:-./data}/sampledb.sqlite
set -a && source ops/backup/backup.env && set +a   # copy from backup.env.example first
./ops/backup/backup-db-restic.sh
```

**docker-compose with named volume** (if you changed docker-compose to use a named volume instead):

```bash
docker exec sampledb sh -c 'f=$(mktemp) && sqlite3 /data/sampledb.sqlite ".backup $f" && cat "$f" && rm -f "$f"' | \
  restic backup --stdin --stdin-filename sampledb.sqlite --tag sampledb ...
```

**fly.io:**

```bash
fly ssh console -C 'f=$(mktemp) && sqlite3 /data/sampledb.sqlite ".backup $f" && cat "$f" && rm -f "$f"' | \
  restic backup --stdin --stdin-filename sampledb.sqlite --tag sampledb ...
```

### Backup storage (RESTIC_REPOSITORY)

- **Local:** `RESTIC_REPOSITORY=local:/backup/sampledb`
- **AWS S3:** `RESTIC_REPOSITORY=s3:s3.amazonaws.com/my-bucket/sampledb` + `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`
- **S3-compatible (MinIO, Spaces, B2):** `RESTIC_REPOSITORY=s3:https://host:port/bucket/sampledb` + AWS-style env vars

See `ops/backup/backup.env.example` for a template.

### Restore

See [Backup and restore — Restore runbook](/docs/guides/advanced/backup-and-restore/#restore-runbook). Short form:

```bash
restic restore latest --tag sampledb --target /tmp/restore
# restored file: /tmp/restore/sampledb.sqlite
```

Stop the app, replace the database file, then restart.

### Retention

Set `RUN_RESTIC_FORGET=1` in `backup.env` to run forget after each successful backup, or on a separate schedule:

```bash
restic forget --tag sampledb --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```
