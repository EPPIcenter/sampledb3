# Blood Controls Pages Redesign Rationale

## Aesthetic: "Modern precision lab" (aligned with dashboard, studies, storage, subject-specimen)

The blood control pages were redesigned to match the existing "modern precision lab" theme: clean, precise, scientific, and lab-oriented. The goal was a consistent visual identity across the app without changing any data or behavior.

## Scope

- **List**: BloodControls (Definitions / Batches tabs, stats, filters, DataTable).
- **Definition detail**: ControlDefinitionDetail (StatCards, composition sidebar, Production History table).
- **Definition form**: New and edit via BloodControlDefinitionPage wrapper (breadcrumb + card + ControlDefinitionForm).
- **Batch detail**: ControlBatchDetail (definition sidebar, Stock & Availability, specimens timeline, Add Specimen modal).
- **Batch wizard**: ControlBatchWizard (multi-step: batch-info → specimen-types → csv-upload → containers → review). On the Batch Info step, control definition selection uses a **filter-and-select** pattern: a search input narrows the list by name, description, or strain; a scrollable list shows matching definitions with type, density, and strains; and a **Create new definition** button opens a modal so users can add a definition without leaving the wizard.

Six entry points total; all render inside `.blood-controls-page`.

## Design choices

- **Scoped theme**: All blood-control styling lives under `.blood-controls-page` and in `packages/web/src/styles/blood-controls.css`. Only blood-control routes use this theme.

- **Token reuse**: Same design tokens as dashboard/studies/storage/subject-specimen: `--dashboard-bg`, `--dashboard-surface`, `--dashboard-card`, `--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`, `--dashboard-text`, `--dashboard-text-muted`, `--dashboard-border`, `--dashboard-trend-up`, `--dashboard-trend-down`. Typography: DM Sans (headings), Source Sans 3 (body).

- **Optional blood/lab accent**: `--blood-controls-badge` and `--blood-controls-badge-bg` used for control-type badges (Blood, plasma positive, etc.) so they feel lab-specific; primary actions and links stay teal.

- **Background**: Light 24×24px grid and soft vertical gradient, matching other themed pages.

- **Cards, tabs, filters, buttons**: Cards use `.dashboard-card` or `.blood-controls-card`; tabs use `.blood-controls-tabs` and `.blood-controls-tab-active`; filters use `.blood-controls-filter-label` and `.blood-controls-pill` / `.blood-controls-pill-selected`; primary/secondary/danger use `.blood-controls-btn-primary`, `.blood-controls-btn-secondary`, `.blood-controls-btn-danger`.

- **Staggered reveal**: `.blood-controls-reveal` and delay classes (blood-controls-reveal-1 … 8) for page load.

- **Definition form as page**: BloodControlDefinitionPage wraps ControlDefinitionForm for `/blood-controls/new` and `/blood-controls/:id/edit`, providing breadcrumb, title, and themed card. Form buttons are themed via parent selector in blood-controls.css when inside `.blood-controls-page`.

## Files touched

- `packages/web/src/styles/blood-controls.css` – new; theme variables, grid, cards, tabs, filters, buttons, reveal, badge, SimpleTimeline, form button overrides.
- `packages/web/src/pages/BloodControls.tsx` – wrapper, import CSS, themed classes, reveal.
- `packages/web/src/pages/ControlDefinitionDetail.tsx` – wrapper, import CSS, themed cards and links.
- `packages/web/src/pages/ControlBatchDetail.tsx` – wrapper, import CSS, themed cards, buttons, modal.
- `packages/web/src/pages/ControlBatchWizard.tsx` – wrapper, import CSS, themed step indicator and card.
- `packages/web/src/pages/BloodControlDefinitionPage.tsx` – new; wrapper for new/edit definition.
- `packages/web/src/App.tsx` – use BloodControlDefinitionPage for `/blood-controls/new` and `/blood-controls/:id/edit`.
- `design/blood-controls-pages-redesign.md` – this file.
- `packages/docs/src/content/docs/guides/features/blood-controls.md` – one-line note on theme.

## Why scoped styles

- **Predictability**: Only blood-control routes are affected.
- **Maintainability**: One CSS file and one wrapper class; future tweaks stay in one place.
- **Consistency**: Same token names as other themed pages so shared components (StatCard, DataTable, etc.) work with `className` or inheritance.
