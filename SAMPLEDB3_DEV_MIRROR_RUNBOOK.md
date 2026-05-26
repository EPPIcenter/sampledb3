# SampleDB3 dev mirror runbook

This runbook walks through hosting a **second** SampleDB3 instance (e.g. `https://dev.sampledb3.eppi.center`) that uses a **dedicated SQLite file** on disk and **reloads it from your existing Restic backups on a schedule** (example: hourly).

**What this gives you:** a stable URL where the app and data look like production, refreshed from backup automatically.

**What this does not do:** deploy unreleased **code** to that URL. The dev container uses whatever container **image** you configure (often the same tag as prod). To test your branch there, build and push a different image tag and point the dev service at it.

**Critical constraints**

- The dev service must use a **separate host directory** for `/data`. Never mount the production database directory into two containers.
- Replacing the SQLite file requires **stopping the dev container** first, then removing stale `sampledb.sqlite-wal` / `sampledb.sqlite-shm` after install (same rules as [SAMPLEDB3_BACKUP_RUNBOOK.md](SAMPLEDB3_BACKUP_RUNBOOK.md)).
- `dev.sampledb3.eppi.center` needs an **explicit DNS record**; a wildcard `*.eppi.center` alone usually does **not** cover this hostname (two labels before the apex in the intuitive reading—treat it as its own FQDN and add `A`/`CNAME` in Porkbun).

Adjust paths (`/opt/sampledb3`, `/var/lib/...`) to match your server.

---

## Checklist (high level)

1. [ ] Create host directory for dev data (empty or seeded by first restore).
2. [ ] Extend Docker Compose: `sampledb3-dev` service + external `web` network (Caddy).
3. [ ] Porkbun: `A` (or `CNAME`) for `dev.sampledb3` → lab box IP.
4. [ ] Caddy: TLS for `dev.sampledb3.eppi.center` + `reverse_proxy` to dev container (follow [CADDY_PLAYBOOK.md](CADDY_PLAYBOOK.md)).
5. [ ] Set `ALLOWED_ORIGINS` on the dev service to include `https://dev.sampledb3.eppi.center`.
6. [ ] Bootstrap: first `restic restore` into dev data dir; start dev container; verify in browser.
7. [ ] Install **host** systemd units (or cron) for hourly restore: stop dev → restore → integrity check → install file → remove WAL/SHM → start dev.
8. [ ] **Harden** dev (basic auth, IP allowlist, or internal-only)—it holds production-shaped data.

---

## 1. Paths and variables (pick once)

| Item | Example | Notes |
|------|---------|--------|
| Compose / deploy dir | `/opt/sampledb3` | Where `docker-compose.yml` lives on the server |
| Prod data (existing) | `/var/lib/sampledb3` | **Do not** reuse for dev |
| Dev data (new) | `/var/lib/sampledb3-dev` | Bind-mounted to dev container as `/data` |
| Restic env file | `/etc/sampledb3/backup.env` | Same repository/password as production backups if you want `latest` prod snapshots |
| Restore job env (optional) | `/etc/sampledb3/dev-restore.env` | Can `source` the same Restic vars; add `DEV_DATA_DIR`, `COMPOSE_DIR` |

Create the dev data directory:

```bash
sudo mkdir -p /var/lib/sampledb3-dev
sudo chmod 700 /var/lib/sampledb3-dev
# If the container runs as a non-root user with a fixed UID/GID, chown to match.
```

---

## 2. Docker Compose

### 2.1 External `web` network

Caddy and your app containers must share the same user-defined network (commonly named `web`). If it does not exist yet:

```bash
docker network create web
```

### 2.2 `docker-compose.yml` changes

Your repo’s [docker-compose.yml](docker-compose.yml) currently defines a single service. On the server, merge the following ideas into your **live** compose file:

- Keep **production** `sampledb3` as-is for behavior, but add `networks: [web]` so Caddy can reach it (if you want Caddy-only access, you can remove the host `ports:` publish later—optional).
- Add **`sampledb3-dev`** with a **different** `container_name`, **different** volume source (`HOST_DATA_DIR_DEV`), and `ALLOWED_ORIGINS` including the dev URL.

Example pattern (adjust image tag and env to your deployment):

```yaml
services:
  sampledb3:
    image: ghcr.io/eppicenter/sampledb3:1.1.0
    container_name: sampledb3
    restart: unless-stopped
    ports:
      - "127.0.0.1:${PORT:-3000}:3000"
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3000
      DATABASE_PATH: ${DATABASE_PATH:-/data/sampledb.sqlite}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-https://sampledb3.eppi.center}
      ERROR_LOG_ENABLED: ${ERROR_LOG_ENABLED:-true}
      ERROR_LOG_LEVEL: ${ERROR_LOG_LEVEL:-error}
      ERROR_LOG_RETENTION_DAYS: ${ERROR_LOG_RETENTION_DAYS:-}
    volumes:
      - ${HOST_DATA_DIR:-./data}:/data
    healthcheck:
      test: ["CMD", "sh", "-c", "wget -qO- http://localhost:3000/health >/dev/null || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    networks:
      - web

  sampledb3-dev:
    image: ghcr.io/eppicenter/sampledb3:1.1.0
    container_name: sampledb3-dev
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_PATH: /data/sampledb.sqlite
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS_DEV:-https://dev.sampledb3.eppi.center}
      ERROR_LOG_ENABLED: ${ERROR_LOG_ENABLED:-true}
      ERROR_LOG_LEVEL: ${ERROR_LOG_LEVEL:-error}
    volumes:
      - ${HOST_DATA_DIR_DEV:-/var/lib/sampledb3-dev}:/data
    healthcheck:
      test: ["CMD", "sh", "-c", "wget -qO- http://localhost:3000/health >/dev/null || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    networks:
      - web

networks:
  web:
    external: true
```

**Notes**

- Dev intentionally omits host `ports:` if you only access it via Caddy. Add `127.0.0.1:3001:3000` temporarily for debugging if needed.
- Set `ALLOWED_ORIGINS_DEV` in a `.env` next to compose if you need multiple origins (comma-separated), matching how your API expects the variable.

Recreate / start:

```bash
cd /opt/sampledb3   # your compose directory
docker compose up -d --force-recreate
```

---

## 3. DNS (Porkbun)

In the `eppi.center` zone, add a record so `dev.sampledb3.eppi.center` resolves to your lab server’s public (or intended) IP:

| Type | Host | Answer | TTL |
|------|------|--------|-----|
| A | `dev.sampledb3` | `<lab-box-IP>` | 600 |

(Exact “Host” field wording follows Porkbun’s UI; the resulting FQDN must be `dev.sampledb3.eppi.center`.)

Verify:

```bash
dig +short dev.sampledb3.eppi.center A
```

---

## 4. Caddy (TLS + reverse proxy)

Follow **[CADDY_PLAYBOOK.md](CADDY_PLAYBOOK.md)** Approach A (acme-dns), treating **`dev.sampledb3.eppi.center`** as the site name:

1. `curl -sX POST https://auth.acme-dns.io/register | jq .` — save JSON; one registration per hostname.
2. Porkbun: CNAME `_acme-challenge.dev.sampledb3` → `<fulldomain>.` from acme-dns (trailing dot).
3. `dig CNAME _acme-challenge.dev.sampledb3.eppi.center +short` — must return the acme-dns target before continuing.
4. Add a key **`"dev.sampledb3.eppi.center"`** to `/opt/caddy/acmedns.json` with `username`, `password`, `subdomain`, `server_url`.
5. Append a site block to `/opt/caddy/Caddyfile`:

```caddyfile
dev.sampledb3.eppi.center {
    reverse_proxy sampledb3-dev:3000
}
```

`sampledb3-dev` must match **`container_name`** from Compose (Caddy resolves it on the `web` network).

**Optional: HTTP basic authentication** (strongly recommended for a DB cloned from prod):

```caddyfile
dev.sampledb3.eppi.center {
    basic_auth {
        devuser JDJhJDE0JEVCNmdaNEg2Ti5...   # output of: caddy hash-password
    }
    reverse_proxy sampledb3-dev:3000
}
```

Reload Caddy:

```bash
cd /opt/caddy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Sanity check from Caddy container:

```bash
docker compose -f /opt/caddy/docker-compose.yml exec caddy \
  wget -qO- http://sampledb3-dev:3000/health
```

Then:

```bash
curl -I https://dev.sampledb3.eppi.center
```

---

## 5. First database bootstrap (manual restore)

Use the same Restic repository and tag your backups use (default tag `sampledb`, stdin filename `sampledb.sqlite` per [ops/backup/backup-db-restic.sh](ops/backup/backup-db-restic.sh)).

**Stop the dev container** before writing the file:

```bash
cd /opt/sampledb3
docker compose stop sampledb3-dev
```

Restore to a **temporary** directory, verify, then install:

```bash
set -a
source /etc/sampledb3/backup.env   # RESTIC_REPOSITORY, RESTIC_PASSWORD, etc.
set +a

RESTORE_TMP=$(mktemp -d)
trap 'rm -rf "$RESTORE_TMP"' EXIT

restic snapshots --tag sampledb
restic restore latest --tag sampledb --target "$RESTORE_TMP"

# Path matches BACKUP_STDIN_FILENAME (default sampledb.sqlite)
RESTORED_FILE="$RESTORE_TMP/sampledb.sqlite"
test -f "$RESTORED_FILE"

sqlite3 "$RESTORED_FILE" "PRAGMA integrity_check;"
# expect: ok

sudo install -m 600 -o root -g root "$RESTORED_FILE" /var/lib/sampledb3-dev/sampledb.sqlite
sudo rm -f /var/lib/sampledb3-dev/sampledb.sqlite-wal /var/lib/sampledb3-dev/sampledb.sqlite-shm
```

Adjust `install` ownership if your container user is not root.

Start dev:

```bash
cd /opt/sampledb3
docker compose start sampledb3-dev
```

Open `https://dev.sampledb3.eppi.center`, log in, and confirm data looks like the snapshot you restored.

---

## 6. Hourly automated restore (systemd on the host)

Run the restore logic as **root** (or a dedicated user that can run `docker compose` and write `DEV_DATA_DIR`). Below uses root for simplicity.

### 6.1 Script: `restore-dev-db.sh`

The maintained copy lives in this repository: [ops/dev-mirror/restore-dev-db.sh](ops/dev-mirror/restore-dev-db.sh).

On the server, install it next to your deployment (paths are examples):

```bash
sudo mkdir -p /opt/sampledb3/ops/dev-mirror
sudo cp /path/to/sampledb3-repo/ops/dev-mirror/restore-dev-db.sh /opt/sampledb3/ops/dev-mirror/
sudo chmod 750 /opt/sampledb3/ops/dev-mirror/restore-dev-db.sh
```

(`ExecStart` in the systemd unit below must match where you installed the script.)

### 6.2 Environment file: `/etc/sampledb3/dev-restore.env`

Mode `600`, root-owned. Include Restic settings (can mirror production backup env) **plus** paths:

```bash
# Restic (same as backup)
RESTIC_REPOSITORY=...
RESTIC_PASSWORD=...
# RESTIC_TAG=sampledb
# BACKUP_STDIN_FILENAME=sampledb.sqlite

# Dev mirror
DEV_DATA_DIR=/var/lib/sampledb3-dev
COMPOSE_DIR=/opt/sampledb3
COMPOSE_SERVICE_DEV=sampledb3-dev
```

### 6.3 systemd unit + timer

**`/etc/systemd/system/sampledb3-dev-restore.service`**

```ini
[Unit]
Description=SampleDB3 dev mirror — restore SQLite from Restic
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/sampledb3/dev-restore.env
ExecStart=/opt/sampledb3/ops/dev-mirror/restore-dev-db.sh
```

**`/etc/systemd/system/sampledb3-dev-restore.timer`**

```ini
[Unit]
Description=Hourly Restic restore for SampleDB3 dev mirror

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sampledb3-dev-restore.timer
sudo systemctl list-timers sampledb3-dev-restore.timer
```

**Operational note:** while the job runs, the dev site is down for a short window. If restores are slow or the DB is huge, consider a less frequent timer first (e.g. `OnCalendar=*-*-* 0/6:00:00` for every six hours).

---

## 7. Verification checklist

- [ ] `docker compose ps` shows `sampledb3` and `sampledb3-dev` healthy.
- [ ] `curl -I https://dev.sampledb3.eppi.center` returns 200/302 (not 502).
- [ ] Login works; data matches expectations for backup age.
- [ ] After forcing a timer run: `sudo systemctl start sampledb3-dev-restore.service` — service ends with `done`, dev comes back, data updates to newer backup (if a newer snapshot exists).

---

## 8. Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| Caddy 502 | Dev container on `web` network? `docker network inspect web`. `container_name` matches Caddyfile upstream? |
| TLS fails | acme-dns CNAME for `_acme-challenge.dev.sampledb3` propagates? JSON key in `acmedns.json` exactly `dev.sampledb3.eppi.center`? |
| CORS / API errors from browser | `ALLOWED_ORIGINS` (or `ALLOWED_ORIGINS_DEV`) includes `https://dev.sampledb3.eppi.center` |
| SQLite corruption after restore | Stale `-wal`/`-shm` removed? Dev stopped during file replace? `PRAGMA integrity_check` on restored file |
| `restic restore` wrong file path | `BACKUP_STDIN_FILENAME` must match backup (`sampledb.sqlite` by default) |

---

## 9. Repo layout

- Runbook: [SAMPLEDB3_DEV_MIRROR_RUNBOOK.md](SAMPLEDB3_DEV_MIRROR_RUNBOOK.md) (this file)
- Restore script: [ops/dev-mirror/restore-dev-db.sh](ops/dev-mirror/restore-dev-db.sh)
