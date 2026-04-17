# SampleDB - Laboratory Information Management System

A modern LIMS built with Hono (TypeScript API) + React for tracking samples, experiments, and SRA submissions.

## Architecture

- **API**: Hono server with SQLite (better-sqlite3) and Drizzle ORM
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: SQLite with polymorphic source model

## Development

### Prerequisites

- Node.js >= 20.0.0
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Run API server (port 3000)
pnpm dev:api

# Run web frontend (port 5173)
pnpm dev:web

# Or run both in parallel
pnpm dev
```

### Build

```bash
# Build all packages
pnpm build

# Start production server
pnpm start
```

## Project Structure

```
sampledb/
├── packages/
│   ├── api/          # Hono API server
│   └── web/          # React frontend
├── sampledb_dev.sqlite        # Default empty dev database (for testing setup)
└── sampledb_database.sqlite  # Production database (use with DATABASE_PATH)
```

## Environment Variables

- `DATABASE_PATH` - Path to SQLite database (default: `./sampledb_dev.sqlite`)
  - For development/testing: Uses empty `sampledb_dev.sqlite` by default (allows testing setup flow)
  - For production data: Set `DATABASE_PATH=sampledb_database.sqlite` to use production database
- `PORT` - API server port (default: `3000`)
- `NODE_ENV` - `production` or `development`

## Testing

- **Run all tests**: `pnpm test` (API + web)
- **API**: `pnpm --filter @sampledb/api test` (Bun). Coverage: `pnpm --filter @sampledb/api test:coverage` (Bun built-in; report in `packages/api/coverage/`). Target 90% lines; see `packages/api/src/__tests__/README.md`.
- **Web**: `pnpm --filter @sampledb/web test` (Vitest). Coverage: `pnpm --filter @sampledb/web test:coverage`. Coverage excludes `src/lib/api.ts` and `src/**/*.css` so the 90% target applies to testable code. Thresholds in `packages/web/vitest.config.ts` can be raised in steps toward 90%.

## Database Configuration

By default, the application uses an empty development database (`sampledb_dev.sqlite`) which is perfect for testing the setup functionality. To use the production database with real data:

```bash
# Use production database (API only)
pnpm dev:api:production

# Use production database (API + Web)
pnpm dev:production

# Or with environment variable
DATABASE_PATH=sampledb_database.sqlite pnpm dev:api
```

## Deployment

### Docker

```bash
cp example.env .env   # optional, edit as needed
docker compose up -d
```

The app runs on port 3000. See `packages/docs` for full deployment and backup documentation.

**Deployment configuration** — see `example.env`. Copy to `.env` and edit. Variables:

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
