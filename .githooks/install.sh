#!/usr/bin/env bash
# Point this clone at repo-managed git hooks (.githooks/pre-commit).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-commit-checks.sh

echo "Git hooks installed (core.hooksPath=.githooks)"
echo "Pre-commit typechecks the packages your staged files touch and lints the staged API and web source files."
echo "It refuses a staged API or web source file that also has unstaged edits, because the lint reads the working tree."
