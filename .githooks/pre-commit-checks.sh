#!/usr/bin/env bash
# Pre-commit checks mirroring CI. Typechecks packages touched by staged files
# and lints the staged API/web source files.
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
