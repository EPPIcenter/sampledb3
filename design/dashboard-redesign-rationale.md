# Dashboard Redesign Rationale

## Lab workflow goals

The dashboard is the lab command center: find samples/studies/containers fast, see what changed, and jump into the right task. Information architecture is workflow-first: "do this" (search, primary actions, next steps) above "see this" (metrics, recent work, insights).

## Information architecture (sections order)

1. **Above the fold**: Hero (greeting + one-line value), prominent search bar (barcode, study code, subject, ID), primary actions (Register specimen, New study, Bulk import, Browse storage).
2. **Today / Next steps**: qPCR Experiments card with recent experiments (name, state, link) and "New qPCR experiment" CTA; empty state when none exist.
3. **Metrics**: Grouped as Inventory (Specimens, Containers), Studies (Studies, Subjects), Storage (Locations). Same five counts and links; section labels clarify mental model.
4. **Recent work**: Recent Studies and Activity Feed side by side.
5. **Insights**: System Insights charts, Blood Controls summary if any, optional "Data as of" timestamp for freshness.

## New functionality

- **Hero search bar**: Prominent search input; submit calls existing search API and opens SearchModal with prefilled query (or navigates to first result). Makes find-by-barcode/ID/code a first-class dashboard action.
- **Browse storage**: "Browse storage" (link to `/locations`) added to primary quick actions so storage is a top-level workflow.
- **Next steps: qPCR**: Section shows recent qPCR experiments (name, state badge, link) and "New qPCR experiment" link; always visible with empty state "No qPCR experiments yet — create one" when none exist. Uses `qpcrExperimentsApi.list({ limit: 5 })`.
- **Metrics grouping**: Same five MetricCards with subtle group labels (Inventory | Studies | Storage) and layout (e.g. three columns or labels above groups).
- **Data as of**: "Data as of &lt;timestamp&gt;" displayed when critical data load completes (e.g. near hero or above insights).

## Aesthetic: "Modern precision lab"

The dashboard uses a lab command center feel: clean, precise, and scientific but approachable. The goal is a clear visual identity with workflow-first layout.

## Design choices

- **Scoped theme**: All dashboard styling lives under a `.dashboard-page` wrapper and in `packages/web/src/styles/dashboard.css`. The rest of the app (sidebar, other pages) is unchanged. This keeps the dashboard recognizable as "home" while avoiding global style drift.

- **Typography**: DM Sans for headings and Source Sans 3 for body, scoped to `.dashboard-page`. This matches the existing qPCR "precision lab" theme so the app feels cohesive.

- **Color**: CSS variables define the palette: off-white/slate background (`--dashboard-bg`, `--dashboard-surface`), white cards (`--dashboard-card`), teal accent (`--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`), and cool grays for text (`--dashboard-text`, `--dashboard-text-muted`). Teal aligns with qPCR and avoids generic purple-on-white.

- **Background**: A very light grid (24×24px) and a soft vertical gradient add depth and a lab/technical feel without distracting from content.

- **Motion**: Staggered reveal on load (hero, search, actions, next steps, metrics, recent work, insights) via `dashboard-reveal` and `animation-delay`. Hover/focus use consistent transitions; focus-visible outlines use the accent for accessibility.

- **Charts**: System Insights passes a dashboard chart palette (teal + slate) into StatChart so pie/bar/line charts match the dashboard. StatChart accepts an optional `cardClassName` so chart cards use `dashboard-card` when rendered on the dashboard.

- **Search bar**: Full-width on mobile, max-width on desktop; teal focus ring; placeholder e.g. "Search by barcode, study code, subject, or ID". Submit opens SearchModal with query or navigates to first result.

- **Next steps card**: Same card style as Quick Actions; list of recent qPCR experiments with state badge and link; "New qPCR experiment" link; empty state when none.

## Why scoped styles

- **Predictability**: Only the dashboard route is affected. Other pages keep their existing look.
- **Maintainability**: One file (`dashboard.css`) and one wrapper class define the theme. Future dashboard tweaks stay in one place.
- **Consistency with qPCR**: qPCR pages already use a scoped `.qpcr-theme`. The dashboard follows the same pattern with `.dashboard-page`.
