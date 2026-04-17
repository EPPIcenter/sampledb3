# SampleDB backup (restic + SQLite)

Versioned backup automation lives here because the repo’s root `scripts/` directory is gitignored for local ad-hoc scripts.

- **`backup-db-restic.sh`** — SQLite online `.backup` to a temp file under `$TMPDIR`, then `restic backup --stdin` (stable restore path `sampledb.sqlite`).
- **`backup.env.example`** — copy to `backup.env` on the backup host (never commit).

See the user guide: [Backup and restore](/docs/guides/advanced/backup-and-restore/) and [Deployment](/docs/guides/advanced/deployment/).
