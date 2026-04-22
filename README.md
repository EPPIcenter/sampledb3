# SampleDB - Laboratory Information Management System

A modern LIMS built with Hono (TypeScript API) + React for tracking samples, experiments, and SRA submissions.

## Architecture

- **API**: Hono server with SQLite (`bun:sqlite`) and Drizzle ORM
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: SQLite with polymorphic source model

## Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0

### Setup

```bash
# Optional: choose which SQLite file the API uses (see Environment Variables below)
cp .env.local.example .env.local
# Uncomment and set DATABASE_PATH if you want a non-default DB, e.g.:
# DATABASE_PATH=./sampledb_database.sqlite

# Install dependencies
bun install

# Run API server (port 3000)
bun run dev:api

# Run web frontend (port 5173)
bun run dev:web

# Or run API + web + docs in parallel
bun run dev
```

### Build

```bash
# Build all packages
bun run build

# Start production server (built API serving static web/docs)
bun run start
```

## Project Structure

```
sampledb/
├── packages/
│   ├── api/          # Hono API server
│   └── web/          # React frontend
├── sampledb_dev.sqlite        # Default empty dev database (for testing setup)
└── sampledb_database.sqlite  # Optional: point DATABASE_PATH here for real data
```

## Environment Variables

Put local overrides in **`.env.local`** (gitignored) at the repo root. Bun’s automatic `.env` loading does **not** apply root files to workspace packages when using `bun --filter` ([bun#10358](https://github.com/oven-sh/bun/issues/10358)), so root scripts such as `bun run dev` pass **`--env-file=.env`** and **`--env-file=.env.local`** explicitly. Missing files are ignored.

- `DATABASE_PATH` — Path to SQLite database (default: `./sampledb_dev.sqlite` when unset)
  - For development/testing: leave unset to use empty `sampledb_dev.sqlite` (allows testing setup flow)
  - For production data locally: set in `.env.local`, e.g. `DATABASE_PATH=./sampledb_database.sqlite`
- `PORT` — API server port (default: `3000`)
- `NODE_ENV` — `production` or `development`

## Testing

- **Unit tests (API + web)**: `bun run test`
- **End-to-end (Playwright)**: `bun run test:e2e`
- **API**: `bun --filter @sampledb/api test` (Bun). Coverage: `bun --filter @sampledb/api test:coverage` (report in `packages/api/coverage/`). Target 90% lines; see `packages/api/src/__tests__/README.md`.
- **Web**: `bun --filter @sampledb/web test` (Vitest). Coverage: `bun --filter @sampledb/web test:coverage`. Coverage excludes `src/lib/api.ts` and `src/**/*.css` so the 90% target applies to testable code. Thresholds in `packages/web/vitest.config.ts` can be raised in steps toward 90%.

## Database Configuration

By default the app uses an empty development database (`sampledb_dev.sqlite`). To use another file (e.g. a production snapshot), add it to `.env.local`:

```bash
cp .env.local.example .env.local
# Edit .env.local and set DATABASE_PATH=./sampledb_database.sqlite
bun run dev
```

## Deployment

### Docker

```bash
cp .env.example .env   # optional, edit as needed
docker compose up -d
```

The app runs on port 3000. See `packages/docs` for full deployment and backup documentation.

**Deployment configuration** — see `.env.example`. Copy to `.env` and edit. Variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST_DATA_DIR` | `./data` | Host path for the database (bind mount). Set to e.g. `/var/lib/sampledb` to store data elsewhere. |
| `PORT` | `3000` | Host port to expose. Use when 3000 is already in use. |
| `DATABASE_PATH` | `/data/sampledb.sqlite` | Path to the SQLite file inside the container. Must match where the volume is mounted. |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins for production. |
| `ERROR_LOG_ENABLED` | `true` | Enable error logging to database. |
| `ERROR_LOG_LEVEL` | `error` | Minimum level: `info`, `warning`, `error`. |
| `ERROR_LOG_RETENTION_DAYS` | — | Days to retain error logs before cleanup. |

### fly.io

See `fly.toml` for a reference configuration. Run `fly launch --no-deploy`, create a volume, then `fly deploy`. No fly.io secrets required for the app; backup secrets go in your backup environment (see deployment guide).

## Backup

Backup is **external** to the app. Use [`ops/backup/backup-db-restic.sh`](ops/backup/backup-db-restic.sh) with restic; run it from cron or systemd on the host (or pipe from Docker/Fly). See [Backup and restore](packages/docs/src/content/docs/guides/advanced/backup-and-restore.md) in the docs.

- **Bind mount** (default `./data:/data`): `DATABASE_PATH=$HOST_DATA_DIR/sampledb.sqlite` (or `./data/sampledb.sqlite`) plus `ops/backup/backup.env` from [`ops/backup/backup.env.example`](ops/backup/backup.env.example)
- **Named volume / fly.io**: pipe a temp-file backup (see [Deployment](packages/docs/src/content/docs/guides/advanced/deployment.md#backup)) or use the host script when the DB file is bind-mounted

## License

MIT
