#!/usr/bin/env bash
set -euo pipefail

# Lists untagged GHCR package versions, keeps the MIN_KEEP newest by updated_at,
# deletes the rest (or prints them when DRY_RUN=true).

MIN_KEEP="${MIN_KEEP:-5}"
DRY_RUN="${DRY_RUN:-false}"

if ! [[ "$MIN_KEEP" =~ ^[0-9]+$ ]]; then
  echo "::error::min-versions-to-keep must be a non-negative integer"
  exit 1
fi

# Prefer canonical owner/repo from the runner (correct login casing for the REST API).
if [[ -n "${GITHUB_REPOSITORY_OWNER:-}" ]]; then
  OWNER="$GITHUB_REPOSITORY_OWNER"
fi
if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
  PACKAGE_NAME="${GITHUB_REPOSITORY##*/}"
fi

if [[ -z "${OWNER:-}" || -z "${PACKAGE_NAME:-}" ]]; then
  echo "::error::OWNER and PACKAGE_NAME are required (pass via action inputs, or run on GitHub Actions so GITHUB_REPOSITORY_OWNER / GITHUB_REPOSITORY are set)."
  exit 1
fi

pkg_lc="${PACKAGE_NAME,,}"
owner_lc="${OWNER,,}"

versions_reachable() {
  gh api "${1}?per_page=1" --silent >/dev/null 2>&1
}

discover_versions_path() {
  local want_lc="$1"
  shift
  local -a owner_candidates=("$@")
  local o prefix ptype page resp n match

  for o in "${owner_candidates[@]}"; do
    [[ -z "$o" ]] && continue
    for prefix in "orgs/${o}" "users/${o}"; do
      for ptype in container docker; do
        page=1
        while true; do
          resp="$(gh api "${prefix}/packages?package_type=${ptype}&per_page=100&page=${page}" 2>/dev/null)" || break
          [[ "$(echo "$resp" | jq -r 'type')" != "array" ]] && break
          n="$(echo "$resp" | jq 'length')"
          [[ "${n:-0}" -eq 0 ]] && break
          match="$(echo "$resp" | jq -r --arg w "$want_lc" '[.[] | select(.name | ascii_downcase == $w)][0].name // empty')"
          if [[ -n "$match" ]]; then
            echo "${prefix}/packages/${ptype}/${match}/versions"
            return 0
          fi
          [[ "$n" -lt 100 ]] && break
          page=$((page + 1))
        done
      done
    done
  done
  return 1
}

resolve_versions_base() {
  local -a owners=("$OWNER")
  [[ "$owner_lc" != "$OWNER" ]] && owners+=("$owner_lc")

  local -a pkgs=("$pkg_lc")
  [[ "$PACKAGE_NAME" != "$pkg_lc" ]] && pkgs+=("$PACKAGE_NAME")

  local o pkg ptype prefix trial

  for o in "${owners[@]}"; do
    for pkg in "${pkgs[@]}"; do
      for ptype in container docker; do
        for prefix in orgs users; do
          trial="${prefix}/${o}/packages/${ptype}/${pkg}/versions"
          if versions_reachable "$trial"; then
            echo "$trial"
            return 0
          fi
        done
      done
    done
  done

  discover_versions_path "$pkg_lc" "${owners[@]}" || return 1
}

BASE="$(resolve_versions_base)" || {
  echo "::error::Could not resolve package '${PACKAGE_NAME}' for owner '${OWNER}'."
  echo "::error::Check GHCR Packages (container name is usually lowercase). Token needs packages:read/write for this repo's package."
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
