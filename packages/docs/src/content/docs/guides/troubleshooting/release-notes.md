---
title: Release Notes
description: Notable SampleDB changes and upgrade guidance
---

This page summarizes user-visible changes that may affect exports, imports, or integrations. For day-to-day export workflows, see [Bulk Export](/docs/guides/bulk-operations/export/), [Barcode Export](/docs/guides/advanced/barcode-export/), and [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/).

## Container export CSV format (breaking change)

SampleDB **container export** CSV files (Bulk export, Study export modal, Barcode export, and GET `/export/containers`) now use **plain RFC 4180 cell values** — quoted strings where needed, without Excel formula wrappers.

**What changed**

- Identifier and text columns (barcodes, subject names, paths, and similar) are exported as normal CSV strings, for example `"001234"` or `MTX-001`.
- SampleDB no longer wraps cells as Excel formulas such as `="001234"`. That legacy workaround was removed so CSV files behave consistently in R, Python, and other tools, and match **Specimen export**, **Inventory export**, and **Collection table snapshot export**.

**Default wire format**

- UTF-8 with BOM (optional in container export UI)
- CRLF line endings (optional in container export UI)
- Comma delimiter (optional in container export UI)

**What to do when upgrading**

- If you relied on Excel opening CSV and preserving leading zeros via formula cells, use **XLSX download** for container exports instead. XLSX marks identifier columns as text cells without CSV workarounds.
- If you parse CSV in scripts, remove any logic that strips `="..."` wrappers — values are plain strings now.
- Re-download a fresh export to validate your pipeline; do not assume older files match the new format.

**Unchanged**

- **Specimen export** and **Inventory export** (command palette) were already plain CSV.
- **Collection table snapshot export** on collection detail pages uses the same CSV download conventions; cell content was not wrapped in Excel formulas.
- Import templates and **Export filter file** uploads are separate from download format; see [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/).

## Related documentation

- [Bulk Export](/docs/guides/bulk-operations/export/) — CSV vs XLSX guidance for multi-study container export
- [Barcode Export](/docs/guides/advanced/barcode-export/) — barcode-driven container export
- [CSV File Guidelines](/docs/guides/troubleshooting/csv-guidelines/) — import and export CSV conventions
