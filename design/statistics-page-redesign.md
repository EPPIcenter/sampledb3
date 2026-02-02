# Statistics Page Redesign

## Goal

Redesign the Statistics page to be modern, lab-oriented, visually attractive, and useful: scoped theme aligned with Dashboard/Storage, clearer hierarchy, themed cards/charts/filters, and UX improvements (filter chips, time presets, section summaries, empty state, optional export and “data as of”).

---

## Current state

- **Statistics.tsx**: Single page with generic container, no theme wrapper. Layout: title/subtitle → histogram controls (bin size, min date) → collapsible StatisticsFilter → 4 summary StatCards → three sections (Specimen Overview, Container Overview, Storage Utilization) with StatChart grids. Loading/error states are plain text.
- **StatCard** and **StatChart** already accept optional `className` / `cardClassName` for theming.
- Dashboard and Storage use a scoped “modern precision lab” theme (`.dashboard-page` / `.storage-page`, dashboard.css / storage.css): DM Sans + Source Sans 3, off-white/slate background, teal accent, cool grays, 24px grid, card borders/shadows.

---

## Design direction

- **Aesthetic**: Same “modern precision lab” as Dashboard/Storage — clean, precise, scientific, scoped so only the Statistics route is affected.
- **Goals**: (1) Visually cohesive with the rest of the app. (2) Clear hierarchy: hero → controls (filters + histogram) → key numbers → detailed charts by domain. (3) Lab-oriented but not gimmicky. (4) Useful: keep all existing data and behavior; improve scannability and emphasis with new UX elements.

---

## Implementation

### 1. Statistics theme (scoped CSS)

- Add **`packages/web/src/styles/statistics.css`**:
  - Reuse same tokens as dashboard/storage (DM Sans, Source Sans 3, `--dashboard-bg`, `--dashboard-card`, `--dashboard-accent`, `--dashboard-text`, `--dashboard-text-muted`, `--dashboard-border`, etc.) scoped under **`.statistics-page`**.
  - Same background: light gradient + subtle 24px grid via `::before`.
  - Card class: `.statistics-card` (same look as dashboard-card / storage-card).
  - Section title: `.statistics-section-title`.
  - Accent styles for Apply Filters, Reset, filter count badge (teal).
- In **Statistics.tsx**, wrap entire page in `<div className="statistics-page">` and `import '../styles/statistics.css'`.

### 2. Page structure and hierarchy

- **Hero**: One line title + short subtitle; theme typography and muted subtitle.
- **Controls block**: Group histogram controls and filter panel:
  - Histogram: bin size, min date, Reset; optionally time-range presets (see below). Style inputs/select with theme border and accent focus.
  - **StatisticsFilter**: Restyle outer card with theme (`statistics-card`), accent for Filters button, badge, Apply/Clear. No change to filter logic.
- **Summary cards**: Four StatCards with `className="statistics-card p-6"`. Optional: small icons per card, staggered reveal.
- **Sections**: Three sections with `.statistics-section-title`; StatChart with `cardClassName="statistics-card p-6"` and optional teal/slate palette. Add **section one-liners** (see below).
- **Loading/error**: Themed skeleton cards and error message (optional retry).

### 3. New features and UX (in scope)

- **Filter chips**: When filters are applied, show removable chips (e.g. “Study: ABC” ×, “Source: Subject” ×) above or beside the filter panel so users see what’s active and can clear one filter without opening the panel. Chips can live in Statistics.tsx (derived from `appliedFilters`) and call back into filter state/onSubmit; or StatisticsFilter can accept an optional slot/render prop for chips. Prefer chips that remove that single filter (e.g. clear study, clear source type) and a “Clear all” that matches existing clearFilters.
- **Time-range presets**: Next to histogram “Minimum date”, add presets: “Last 30 days”, “Last 6 months”, “This year”, “All time”. Each preset sets min date (and optionally max date if API supports it); “All time” = e.g. 2000-01-01. Implement client-side (compute date from today, set minDate in URL/searchParams).
- **Section one-liners**: Under each section title (Specimen Overview, Container Overview, Storage Utilization), add a short summary line computed from current data, e.g. “X specimens across Y studies; top type: Z”, “X containers across Y types; avg Z per specimen”, “X locations; top: Y”. Derive from existing `data` in Statistics.tsx; no API change.
- **Unified empty state**: When filters return no data (e.g. `data.specimens.total === 0` and appliedFilters non-empty), show a single prominent message (e.g. “No data for this filter combination”) with “Clear filters” or “Broaden filters” action instead of repeating “No data available” in each chart. When there is no data at all (empty system), keep or adjust message accordingly.

### 4. Optional enhancements

- **Export / print**: “Export summary” (e.g. key numbers as CSV) and/or “Print view” (window.print with statistics-page styles). Aligns with docs (“export functionality directly from the statistics page”).
- **“Data as of”**: Small “Data as of [timestamp]” or “Last updated …” (e.g. at fetch time); display near hero or controls so users know freshness.
- **Key insight strip**: Optional one-line “At a glance” (e.g. “Largest study: X (N specimens)”, “Most used location: Y”) for users who want a single takeaway without opening charts.
- **Chart tooltips**: Ensure all charts show counts and, where relevant, percentages in a consistent format.
- **Mobile**: Summary cards stack; charts full-width or horizontal scroll; filter panel full-width with larger tap targets.
- **Admin Statistics**: Apply same theme/layout to `/admin/statistics` in a follow-up.

### 5. Component usage (no API or data contract changes)

- **Statistics.tsx**: Wrapper, CSS import, theme classes; filter chips (new block or integrate with filter); time presets (buttons/links that set searchParams); section one-liners (computed per section); unified empty state (conditional block before or instead of chart grids when total is 0 and filters applied); optional “Data as of”, export, key insight.
- **StatisticsFilter.tsx**: Optional `className` for outer container; use theme class when inside `.statistics-page` so the filter card is styled by statistics.css. Optionally support an `onRemoveFilter(key)` or expose applied filters for chips in parent (if chips are in Statistics.tsx, parent already has appliedFilters).
- **StatCard / StatChart**: No API changes; only pass theme class names and optional colors from Statistics page.

### 6. Documentation and design rationale

- **Docs**: Update **`packages/docs/src/content/docs/guides/advanced/statistics.md`** to describe the modern lab theme, layout (controls at top, key metrics, then Specimen / Container / Storage sections), and new UX: filter chips, time presets, section summaries, empty state. Mention export/print if implemented.
- **This doc**: `design/statistics-page-redesign.md` is the single design reference; update it if scope changes.

---

## Files to touch

| Area | Files |
|------|--------|
| Theme | **New** `packages/web/src/styles/statistics.css` |
| Page | **Edit** `packages/web/src/pages/Statistics.tsx` (wrapper, imports, classes, filter chips, time presets, section one-liners, empty state, optional export/data-as-of/insight) |
| Filter | **Edit** `packages/web/src/components/StatisticsFilter.tsx` (theme classes; optional support for chips e.g. callback or prop) |
| Docs | **Edit** `packages/docs/src/content/docs/guides/advanced/statistics.md` |
| Design | **This file** `design/statistics-page-redesign.md` |

---

## Implementation status

- **Done**: Scoped theme (`.statistics-page`, `statistics.css`), wrapper and import in Statistics.tsx; filter at top; filter chips (removable, Clear all); summary cards in order: Total Specimens → Total Containers → Storage Locations → Container Types; timeline chart display card (bin size, min date, time presets) placed after summary cards with title "Timeline chart display" and description that these options apply only to Collection Timeline and Creation Timeline charts; time-range presets (Last 30 days, Last 6 months, This year, All time); section one-liners (Specimen, Container, Storage); unified empty state when filters return no data; StatisticsFilter optional `className` for theme; StatCard/StatChart theme classes; docs and this design doc updated.

---

## Out of scope

- No change to statistics API, filter logic, or chart data contracts.
- No new routes or feature flags.
- “Compare to previous period” or trend deltas would require API support; not in this redesign.
