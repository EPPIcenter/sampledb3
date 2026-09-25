#!/usr/bin/env bash
# Fail if the user guide still contains known-wrong strings.
set -euo pipefail
docs="$(cd "$(dirname "$0")/.." && pwd)"
content="$docs/src/content/docs"
fail=0

check() {
  local pattern="$1"
  local why="$2"
  if rg -n --glob '!**/design-tokens.md' -e "$pattern" "$content" "$docs/astro.config.mjs" "$docs/README.md" >/dev/null; then
    echo "STALE: $why"
    rg -n --glob '!**/design-tokens.md' -e "$pattern" "$content" "$docs/astro.config.mjs" "$docs/README.md" || true
    fail=1
  fi
}

check 'docs\.example\.com' 'placeholder site URL'
check 'github.com/withastro/starlight' 'Starlight starter GitHub link'
check 'Seasoned astronaut' 'Starlight starter README'
check 'A reference page in my new Starlight' 'Starlight example page'
check 'modern precision lab' 'implementation theme name in user guide'
check 'redirect you to the dashboard' 'Finish Setup goes to sign-in, not the dashboard'
check 'Click \*\*Create Study\*\*' 'study form submit button is Create'
check 'Choose File' 'import uses a CSV File input, not Choose File'
check 'drag and drop' 'bulk import has no drag-and-drop'
check 'Template ready' 'qPCR dashboard status is In progress, not Template ready'
check 'Dashboard → Export' 'dashboard has Bulk Import, not Export'
check 'Lead person' 'study form label is Lead Person'
check 'command palette \(press Ctrl\+K' 'Ctrl+K opens search; command palette is Ctrl+Shift+K'
check 'command palette \(\*\*Ctrl\+K' 'Ctrl+K opens search; command palette is Ctrl+Shift+K'
check 'docker compose stop sampledb[^-3]' 'compose service is sampledb3'
check 'docker exec sampledb ' 'container name is sampledb3'
check 'keep-daily 7' 'restic forget keeps 14 daily snapshots'
check 'docker compose run --rm demo-seed' 'there is no demo-seed compose service'
check '"Execute Move"' 'paper move confirm button is Confirm Move'
check '\[Barcode Export\]' 'sidebar and page heading are Micronix Barcode Export'

if [ "$fail" -ne 0 ]; then
  echo
  echo 'User guide still has stale claims. See packages/docs/scripts/check-stale-claims.sh'
  exit 1
fi

echo 'No known-stale user-guide claims.'
