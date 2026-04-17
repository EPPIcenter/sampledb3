#!/usr/bin/env bash
# Online SQLite backup to a temp file, then restic (stdin) for a stable snapshot name.
# Requires: sqlite3, restic; env: DATABASE_PATH, RESTIC_REPOSITORY, RESTIC_PASSWORD
set -euo pipefail

: "${DATABASE_PATH:?DATABASE_PATH is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"

TAG="${RESTIC_TAG:-sampledb}"
STDIN_NAME="${BACKUP_STDIN_FILENAME:-sampledb.sqlite}"

for cmd in sqlite3 restic; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "backup-db-restic.sh: required command not found: $cmd" >&2
    exit 1
  fi
done

if [ ! -r "$DATABASE_PATH" ]; then
  echo "backup-db-restic.sh: DATABASE_PATH is not a readable file: $DATABASE_PATH" >&2
  exit 1
fi

# Temp file in $TMPDIR avoids a second file next to the live DB during backup.
backup_file=$(mktemp "${TMPDIR:-/tmp}/sampledb-restic.XXXXXX")
chmod 600 "$backup_file"
cleanup() { rm -f "$backup_file"; }
trap cleanup EXIT

export RESTIC_REPOSITORY
export RESTIC_PASSWORD

echo "backup-db-restic.sh: backing up $DATABASE_PATH -> restic (tag=$TAG)" >&2

if ! sqlite3 "$DATABASE_PATH" ".backup $backup_file"; then
  echo "backup-db-restic.sh: sqlite3 .backup failed" >&2
  exit 1
fi

if [ ! -s "$backup_file" ]; then
  echo "backup-db-restic.sh: backup file is empty after .backup" >&2
  exit 1
fi

restic backup --stdin --stdin-filename "$STDIN_NAME" --tag "$TAG" < "$backup_file"

if [ "${RUN_RESTIC_FORGET:-0}" = "1" ] || [ "${RUN_RESTIC_FORGET:-}" = true ]; then
  echo "backup-db-restic.sh: running restic forget --tag $TAG (retention) --prune" >&2
  restic forget --tag "$TAG" --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
fi

echo "backup-db-restic.sh: done" >&2
