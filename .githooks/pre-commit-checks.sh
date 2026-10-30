#!/usr/bin/env bash
# Pre-commit checks mirroring CI. Typechecks packages touched by staged files
# and lints the staged API/web source files (refusing ones with unstaged edits).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

needs_contract=false
needs_api=false
needs_web=false
has_staged=false
api_lint_files=()
web_lint_files=()

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  has_staged=true
  case "$file" in
    packages/contract/*)
      needs_contract=true
      needs_api=true
      needs_web=true
      ;;
    packages/api/*)
      needs_api=true
      [[ "$file" == packages/api/src/*.ts ]] && api_lint_files+=("${file#packages/api/}")
      ;;
    packages/web/*)
      needs_web=true
      [[ "$file" == packages/web/src/*.ts || "$file" == packages/web/src/*.tsx ]] && web_lint_files+=("${file#packages/web/}")
      ;;
    Dockerfile|.dockerignore|package.json|bun.lock|packages/*/package.json|packages/*/tsconfig*.json)
      needs_contract=true
      needs_api=true
      needs_web=true
      ;;
  esac
done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)

if ! $has_staged || { ! $needs_contract && ! $needs_api && ! $needs_web; }; then
  exit 0
fi

# eslint reads files from disk, and the typed rules can't lint a staged blob over stdin (they take
# type information from the file on disk), so a file with unstaged edits would be linted as it is
# in the working tree rather than as it will be committed. Refuse those instead.
partially_staged=()
for file in ${api_lint_files[@]+"${api_lint_files[@]}"}; do
  git diff --quiet -- "packages/api/$file" || partially_staged+=("packages/api/$file")
done
for file in ${web_lint_files[@]+"${web_lint_files[@]}"}; do
  git diff --quiet -- "packages/web/$file" || partially_staged+=("packages/web/$file")
done
if (( ${#partially_staged[@]} > 0 )); then
  echo "pre-commit: these files have unstaged changes, so the lint would check the working tree, not the commit:" >&2
  printf '  %s\n' "${partially_staged[@]}" >&2
  echo "Stage them fully, or set the unstaged edits aside (git stash push --keep-index) and commit again." >&2
  exit 1
fi

echo "pre-commit: running typecheck for staged TypeScript changes..."

if $needs_contract; then
  bun --filter @sampledb/contract typecheck
fi
if $needs_api; then
  bun --filter @sampledb/api typecheck
fi
if $needs_web; then
  bun --filter @sampledb/web typecheck
fi

echo "pre-commit: typecheck passed."

if (( ${#api_lint_files[@]} > 0 )); then
  echo "pre-commit: linting staged API files..."
  (cd packages/api && bunx eslint --no-warn-ignored "${api_lint_files[@]}")
fi
if (( ${#web_lint_files[@]} > 0 )); then
  echo "pre-commit: linting staged web files..."
  (cd packages/web && bunx eslint --no-warn-ignored "${web_lint_files[@]}")
fi
