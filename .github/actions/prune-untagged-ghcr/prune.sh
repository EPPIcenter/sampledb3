#!/usr/bin/env bash
set -euo pipefail

# Lists untagged GHCR package versions, keeps the MIN_KEEP newest by updated_at,
# deletes the rest (or prints them when DRY_RUN=true).

if [[ -z "${OWNER:-}" || -z "${PACKAGE_NAME:-}" ]]; then
  echo "::error::OWNER and PACKAGE_NAME are required"
  exit 1
fi

MIN_KEEP="${MIN_KEEP:-5}"
DRY_RUN="${DRY_RUN:-false}"

if ! [[ "$MIN_KEEP" =~ ^[0-9]+$ ]]; then
  echo "::error::min-versions-to-keep must be a non-negative integer"
  exit 1
fi

resolve_base_path() {
  local o="$1" pkg="$2"
  if gh api "orgs/${o}/packages/container/${pkg}/versions?per_page=1" --silent >/dev/null 2>&1; then
    echo "orgs/${o}/packages/container/${pkg}/versions"
    return 0
  fi
  if gh api "users/${o}/packages/container/${pkg}/versions?per_page=1" --silent >/dev/null 2>&1; then
    echo "users/${o}/packages/container/${pkg}/versions"
    return 0
  fi
  return 1
}

BASE="$(resolve_base_path "$OWNER" "$PACKAGE_NAME")" || {
  echo "::error::Container package '${PACKAGE_NAME}' not found for owner '${OWNER}' (tried orgs/ and users/)."
  exit 1
}

echo "Using package endpoint: ${BASE}"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

page=1
while true; do
  chunk="$(gh api "${BASE}?per_page=100&page=${page}")"
  n="$(echo "$chunk" | jq 'length')"
  if [[ "$n" -eq 0 ]]; then
    break
  fi
  echo "$chunk" | jq -c '.[]' >>"$tmp"
  if [[ "$n" -lt 100 ]]; then
    break
  fi
  page=$((page + 1))
done

if [[ ! -s "$tmp" ]]; then
  echo "No package versions returned; nothing to do."
  exit 0
fi

mapfile -t DELETE_IDS < <(
  jq -s -r --argjson keep "$MIN_KEEP" '
    [.[] | select((.metadata.container.tags // []) | length == 0)]
    | sort_by(.updated_at)
    # Oldest first: delete the prefix, keep the last `keep` (newest untagged).
    | if length <= $keep then empty else .[0:(length - $keep)][] end
    | .id
  ' "$tmp"
)

if [[ "${#DELETE_IDS[@]}" -eq 0 ]]; then
  echo "No untagged versions to prune (or all are within min-versions-to-keep)."
  exit 0
fi

echo "Untagged versions selected for removal: ${#DELETE_IDS[@]} (dry-run=${DRY_RUN})"

for id in "${DELETE_IDS[@]}"; do
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "dry-run: would DELETE ${BASE}/${id}"
  else
    echo "Deleting untagged version id=${id}"
    gh api -X DELETE "${BASE}/${id}" --silent
  fi
done

echo "Done."
