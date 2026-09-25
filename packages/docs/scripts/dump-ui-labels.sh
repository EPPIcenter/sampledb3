#!/usr/bin/env bash
# Dump the UI strings the user guide must match. Re-run after web copy changes.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
web="$root/packages/web/src"

echo "=== Sidebar labels ==="
rg -N --pcre2 "^\s+label: '([^']+)'" -r '$1' "$web/components/Sidebar.tsx" || true

echo
echo "=== Setup wizard ==="
rg -N "Step \{step\} of 4|Create Administrator|Finish Setup|Paper \(DBS Sheet\)|Cryovial Tube|Micronix Tube|Static Well" "$web/pages/Setup.tsx" || true

echo
echo "=== Setup defaults ==="
rg -N "name: '" "$web/config/setup-defaults.ts" || true

echo
echo "=== Settings sections ==="
rg -N "label: '" "$web/pages/Settings.tsx" || true

echo
echo "=== Dashboard copy ==="
rg -N "Lab Overview|Quick Actions|Register New Specimen|Create New Study|Bulk Import|Browse Storage|qPCR Experiments|New qPCR experiment|Setup|In progress|Results imported|Inventory|System Insights|Blood Controls|Recent Studies" "$web/pages/Dashboard.tsx" "$web/components/dashboard" || true

echo
echo "=== Study form ==="
rg -N "Title \*|Short Code \*|Lead Person \*|Longitudinal Study|>Create<|>Update<" "$web/components/forms/StudyForm.tsx" || true

echo
echo "=== Import ==="
rg -N "Subjects Only|Specimens Only|Subjects with Specimens|No Containers|Micronix Tubes|Cryovial Tubes|Validate & Continue|CSV File \*|Download Template" "$web/components/BulkImportFlow.tsx" || true
