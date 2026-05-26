#!/usr/bin/env bash
# Restores latest Restic snapshot (tag sampledb by default) into the dev mirror data dir.
# Stops the dev Compose service, replaces sampledb.sqlite, clears WAL/SHM, starts the service.
#
# Environment (e.g. via systemd EnvironmentFile=/etc/sampledb3/dev-restore.env):
#   RESTIC_REPOSITORY, RESTIC_PASSWORD  — required
#   DEV_DATA_DIR                        — host path mounted as /data in dev container
#   COMPOSE_DIR                         — directory containing docker-compose.yml
#   COMPOSE_SERVICE_DEV                 — dev service name (e.g. sampledb3-dev)
#   RESTIC_TAG                          — optional, default sampledb
#   BACKUP_STDIN_FILENAME               — optional, default sampledb.sqlite
#
# See SAMPLEDB3_DEV_MIRROR_RUNBOOK.md
set -euo pipefail

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"
: "${DEV_DATA_DIR:?DEV_DATA_DIR is required}"
: "${COMPOSE_DIR:?COMPOSE_DIR is required}"
: "${COMPOSE_SERVICE_DEV:?COMPOSE_SERVICE_DEV is required}"

TAG="${RESTIC_TAG:-sampledb}"
STDIN_NAME="${BACKUP_STDIN_FILENAME:-sampledb.sqlite}"

for cmd in restic sqlite3 docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "restore-dev-db.sh: required command not found: $cmd" >&2
    exit 1
  fi
done

export RESTIC_REPOSITORY
export RESTIC_PASSWORD

RESTORE_TMP=$(mktemp -d)
trap 'rm -rf "$RESTORE_TMP"' EXIT

echo "$(date -Iseconds) restore-dev-db: stopping ${COMPOSE_SERVICE_DEV}" >&2
docker compose -f "${COMPOSE_DIR}/docker-compose.yml" stop "${COMPOSE_SERVICE_DEV}"

echo "$(date -Iseconds) restore-dev-db: restic restore latest (tag=${TAG})" >&2
restic restore latest --tag "${TAG}" --target "${RESTORE_TMP}"

RESTORED_FILE="${RESTORE_TMP}/${STDIN_NAME}"
if [ ! -f "${RESTORED_FILE}" ]; then
  echo "restore-dev-db.sh: expected file missing: ${RESTORED_FILE}" >&2
  exit 1
fi

if ! sqlite3 "${RESTORED_FILE}" "PRAGMA integrity_check;" | grep -qx ok; then
  echo "restore-dev-db.sh: integrity_check failed" >&2
  sqlite3 "${RESTORED_FILE}" "PRAGMA integrity_check;" >&2 || true
  exit 1
fi

install -m 600 -o root -g root "${RESTORED_FILE}" "${DEV_DATA_DIR}/sampledb.sqlite"
rm -f "${DEV_DATA_DIR}/sampledb.sqlite-wal" "${DEV_DATA_DIR}/sampledb.sqlite-shm"

echo "$(date -Iseconds) restore-dev-db: starting ${COMPOSE_SERVICE_DEV}" >&2
docker compose -f "${COMPOSE_DIR}/docker-compose.yml" start "${COMPOSE_SERVICE_DEV}"

echo "$(date -Iseconds) restore-dev-db: done" >&2
