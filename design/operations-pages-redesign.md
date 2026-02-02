# Operations Pages Redesign Rationale

## Scope

All pages under the **Operations** sidebar section:

- **Import** (`/import`) – multi-step CSV wizard (upload → collections → import)
- **Export** (expandable): Multi-Study Export (`/export`), Micronix Barcode Export (`/barcode-export`)
- **Move Containers** (expandable): Move Micronix Tubes, Move Cryovial Tubes, Move Papers
- **Move Collections** (`/collection-move`)
- **Derivations** (`/derivations`) and **Derivations Import** (`/derivations/import`)

## Decision: Reuse "modern precision lab" theme

Operations pages reuse the same visual theme as storage/containers and dashboard:

- **Scoped theme**: `.storage-page` wrapper and [packages/web/src/styles/storage.css](packages/web/src/styles/storage.css)
- **Tokens**: Off-white/slate background, teal accent (`--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`), white cards, cool grays for text
- **Typography**: DM Sans (headings), Source Sans 3 (body), same as dashboard and storage
- **Components**: `storage-card`, `storage-btn-primary`, `storage-btn-secondary`, `storage-section-title`, `storage-link`, optional `storage-reveal` for staggered load

No new CSS file; all Operations routes share the same lab-themed look as Locations and move wizards.

## Design choices

- **Step indicators**: Shared wizard step classes in storage.css (`.storage-step-indicator`, `.storage-step-item`, `.storage-step-item--active`, `.storage-step-item__circle`, `.storage-step-connector`) so Import, DerivationsBulkImport, CollectionMove, and ContainerMove* wizards use teal for the active step and consistent spacing.
- **Cards**: All main content blocks use `storage-card`; info/validation boxes use accent-muted where appropriate (e.g. "Required CSV Columns", validation "Validating...").
- **Buttons**: Primary actions use `storage-btn-primary` (teal); secondary/back/cancel use `storage-btn-secondary`.
- **Links**: In-page links (e.g. "Download Template", "Manage in Settings") use `storage-link` for teal styling.
- **Behavior**: No data or API changes; URLs and flows unchanged. Visual and layout only.

## Files touched

- **packages/web/src/styles/storage.css** – Added `.storage-step-indicator`, `.storage-step-item`, `.storage-step-item--active`, `.storage-step-item__circle`, `.storage-step-connector` for wizard steps.
- **packages/web/src/pages/Import.tsx** – Wrapper, import storage.css, step indicator, storage cards/buttons/links, info boxes with accent-muted.
- **packages/web/src/pages/Export.tsx** – Wrapper, import storage.css, storage cards, primary button, validation/summary styling with accent where appropriate.
- **packages/web/src/pages/BarcodeExport.tsx** – Wrapper, import storage.css, storage cards, storage-link, config selector and summary with accent, primary button.
- **packages/web/src/pages/Derivations.tsx** – Wrapper, import storage.css, storage-card, teal CTA (Import CSV), muted text.
- **packages/web/src/pages/DerivationsBulkImport.tsx** – Wrapper, import storage.css, step indicator, storage cards/buttons, accent-muted for source config and Total/All-or-nothing.
- **packages/web/src/pages/CollectionMove.tsx** – Step indicator and step content use storage-step-* and storage-card; buttons use storage-btn-primary/secondary.
- **packages/web/src/pages/ContainerMoveMicronix.tsx** – Same: storage-step-indicator, storage-card, storage-btn-primary/secondary, storage-link.
- **packages/web/src/pages/ContainerMoveCryovial.tsx** – Same pattern.
- **packages/web/src/pages/ContainerMovePapers.tsx** – Same pattern (5-step wizard).
- **design/operations-pages-redesign.md** – This document.

## Consistency with existing design

- Aligns with [design/containers-collections-redesign.md](containers-collections-redesign.md) and [design/dashboard-redesign-rationale.md](dashboard-redesign-rationale.md).
- Operations and Storage both use `.storage-page` + storage.css so the whole "lab workflow" area (import, export, move, derivations, locations, containers) feels cohesive.
