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

# GitHub REST expects the package name segment URL-encoded (e.g. owner/repo -> owner%2Frepo).
pkg_enc_path_segment() {
  printf '%s' "$1" | jq -sRr @uri
}

graphql_repo_container_names() {
  local owner="$1" repo="$2" resp ptype
  for ptype in CONTAINER DOCKER; do
    resp="$(gh api graphql \
      -f query='query($owner:String!,$name:String!,$ptype:PackageType!){repository(owner:$owner,name:$name){packages(first:50,packageType:$ptype){nodes{name}}}}' \
      -f owner="$owner" \
      -f name="$repo" \
      -f ptype="$ptype" 2>/dev/null)" || continue
    if [[ "$(echo "$resp" | jq -r '.data.repository // empty')" == "null" ]]; then
      continue
    fi
    echo "$resp" | jq -r '.data.repository.packages.nodes[]?.name // empty'
  done
}

# Org/user GraphQL can surface GHCR names when REST probes return 404 for the workflow token.
graphql_org_packages_matching() {
  local login="$1" want_lc="$2" resp ptype
  for ptype in CONTAINER DOCKER; do
    resp="$(gh api graphql \
      -f query='query($login:String!,$ptype:PackageType!){organization(login:$login){packages(first:100,packageType:$ptype){nodes{name}}}}' \
      -f login="$login" \
      -f ptype="$ptype" 2>/dev/null)" || continue
    [[ "$(echo "$resp" | jq -r '.data.organization // empty')" == "null" ]] && continue
    echo "$resp" | jq -r --arg w "$want_lc" '.data.organization.packages.nodes[]?.name | select((ascii_downcase == $w) or (ascii_downcase | endswith("/" + $w)))'
  done
}

graphql_user_packages_matching() {
  local login="$1" want_lc="$2" resp ptype
  for ptype in CONTAINER DOCKER; do
    resp="$(gh api graphql \
      -f query='query($login:String!,$ptype:PackageType!){user(login:$login){packages(first:100,packageType:$ptype){nodes{name}}}}' \
      -f login="$login" \
      -f ptype="$ptype" 2>/dev/null)" || continue
    [[ "$(echo "$resp" | jq -r '.data.user // empty')" == "null" ]] && continue
    echo "$resp" | jq -r --arg w "$want_lc" '.data.user.packages.nodes[]?.name | select((ascii_downcase == $w) or (ascii_downcase | endswith("/" + $w)))'
  done
}

versions_reachable() {
  gh api "${1}?per_page=1" --silent >/dev/null 2>&1
}

discover_versions_path() {
  local want_lc="$1"
  shift
  local -a owner_candidates=("$@")
  local o prefix ptype page resp n match match_enc

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
          match="$(echo "$resp" | jq -r --arg w "$want_lc" '[.[] | select((.name | ascii_downcase == $w) or (.name | ascii_downcase | endswith("/" + $w)))][0].name // empty')"
          if [[ -n "$match" ]]; then
            match_enc="$(pkg_enc_path_segment "$match")"
            echo "${prefix}/packages/${ptype}/${match_enc}/versions"
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
  pkgs+=("${owner_lc}/${pkg_lc}")
  [[ "${OWNER}/${PACKAGE_NAME}" != "${owner_lc}/${pkg_lc}" ]] && pkgs+=("${OWNER}/${PACKAGE_NAME}")

  try_pkg_locations() {
    local pkg_raw="$1"
    local pkg_enc o ptype prefix trial
    pkg_enc="$(pkg_enc_path_segment "$pkg_raw")"
    for o in "${owners[@]}"; do
      for ptype in container docker; do
        for prefix in orgs users; do
          trial="${prefix}/${o}/packages/${ptype}/${pkg_enc}/versions"
          if versions_reachable "$trial"; then
            echo "$trial"
            return 0
          fi
        done
      done
    done
    return 1
  }

  local pkg
  for pkg in "${pkgs[@]}"; do
    if try_pkg_locations "$pkg"; then
      return 0
    fi
  done

  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    local ro rn gn
    ro="${GITHUB_REPOSITORY%%/*}"
    rn="${GITHUB_REPOSITORY##*/}"
    while IFS= read -r gn; do
      [[ -z "$gn" ]] && continue
      if try_pkg_locations "$gn"; then
        return 0
      fi
    done < <(graphql_repo_container_names "$ro" "$rn" || true)
  fi

  local ol gn
  for ol in "$OWNER" "$owner_lc"; do
    while IFS= read -r gn; do
      [[ -z "$gn" ]] && continue
      if try_pkg_locations "$gn"; then
        return 0
      fi
    done < <(graphql_org_packages_matching "$ol" "$pkg_lc" || true)
    while IFS= read -r gn; do
      [[ -z "$gn" ]] && continue
      if try_pkg_locations "$gn"; then
        return 0
      fi
    done < <(graphql_user_packages_matching "$ol" "$pkg_lc" || true)
  done

  discover_versions_path "$pkg_lc" "${owners[@]}" || return 1
}

BASE="$(resolve_versions_base)" || {
  echo "::error::Could not resolve package '${PACKAGE_NAME}' for owner '${OWNER}'."
  echo "::error::If the image exists on GHCR: org policies may block GITHUB_TOKEN from the Packages API—add a repo secret PAT with read:packages (+ delete:packages to prune) and SSO authorized, then pass it via the action input github-token."
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
