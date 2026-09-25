#!/usr/bin/env bash
# Online SQLite backup to a temp file, then restic (stdin) for a stable snapshot name.
# Requires: sqlite3, restic; env: DATABASE_PATH, RESTIC_REPOSITORY, RESTIC_PASSWORD
# Optional: RESTIC_COPY_REPOSITORY to restic copy snapshots to a second repo after backup.
set -euo pipefail

: "${DATABASE_PATH:?DATABASE_PATH is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"

TAG="${RESTIC_TAG:-sampledb}"
STDIN_NAME="${BACKUP_STDIN_FILENAME:-sampledb.sqlite}"

want_forget() {
  [ "${RUN_RESTIC_FORGET:-0}" = "1" ] || [ "${RUN_RESTIC_FORGET:-}" = true ]
}

run_restic_forget() {
  echo "backup-db-restic.sh: running restic forget --tag $TAG (retention) --prune" >&2
  restic forget --tag "$TAG" --keep-daily 14 --keep-weekly 12 --keep-monthly 60 --prune
}

# restic < 0.14: --repo is source, --repo2 is dest.
# restic >= 0.14: --from-repo is source, --repo is dest.
restic_copy_to_second_repo() {
  local src="$RESTIC_REPOSITORY"
  local src_pw="${RESTIC_FROM_PASSWORD:-$RESTIC_PASSWORD}"
  local dst="$RESTIC_COPY_REPOSITORY"
  local dst_pw="${RESTIC_COPY_PASSWORD:-$RESTIC_PASSWORD}"

  echo "backup-db-restic.sh: copying snapshots -> $dst" >&2

  if restic copy --help 2>&1 | grep -q -- '--from-repo'; then
    RESTIC_FROM_REPOSITORY="$src" \
    RESTIC_FROM_PASSWORD="$src_pw" \
    RESTIC_REPOSITORY="$dst" \
    RESTIC_PASSWORD="$dst_pw" \
      restic copy
  else
    RESTIC_REPOSITORY="$src" \
    RESTIC_PASSWORD="$src_pw" \
    RESTIC_REPOSITORY2="$dst" \
    RESTIC_PASSWORD2="$dst_pw" \
      restic copy
  fi
}

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

# systemd oneshot often has no HOME; restic then cannot find its cache.
if [ -z "${HOME:-}" ] && [ -z "${XDG_CACHE_HOME:-}" ] && [ -z "${RESTIC_CACHE_DIR:-}" ]; then
  export RESTIC_CACHE_DIR="${TMPDIR:-/tmp}/restic-cache"
  mkdir -p "$RESTIC_CACHE_DIR"
  chmod 700 "$RESTIC_CACHE_DIR"
fi

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

if want_forget; then
  run_restic_forget
fi

if [ -n "${RESTIC_COPY_REPOSITORY:-}" ]; then
  if [ "$RESTIC_COPY_REPOSITORY" = "$RESTIC_REPOSITORY" ]; then
    echo "backup-db-restic.sh: RESTIC_COPY_REPOSITORY must differ from RESTIC_REPOSITORY" >&2
    exit 1
  fi

  restic_copy_to_second_repo

  if want_forget; then
    RESTIC_REPOSITORY="$RESTIC_COPY_REPOSITORY" \
    RESTIC_PASSWORD="${RESTIC_COPY_PASSWORD:-$RESTIC_PASSWORD}" \
      run_restic_forget
  fi
fi

echo "backup-db-restic.sh: done" >&2
