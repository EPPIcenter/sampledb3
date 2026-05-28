#!/usr/bin/env bash
# Point this clone at repo-managed git hooks (.githooks/pre-commit).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-commit-checks.sh

echo "Git hooks installed (core.hooksPath=.githooks)"
echo "Pre-commit runs typecheck on packages touched by staged files."
