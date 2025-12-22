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
├── data/             # Database files
└── sampledb_database.sqlite  # Existing SQLite database
```

## Environment Variables

- `DATABASE_PATH` - Path to SQLite database (default: `./sampledb_database.sqlite`)
- `PORT` - API server port (default: `3000`)
- `NODE_ENV` - `production` or `development`

## License

MIT
