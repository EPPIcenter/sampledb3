# Containers and Collections Pages Redesign Rationale

## Scope

- **Locations** (`/locations`) – Main storage hub: location tree, collection search, location preview, contents as clickable collection cards.
- **LocationDetail** (`/locations/:id`) – Full location page with paginated collection sections and collection cards.
- **Collection detail pages** – MicronixPlateDetail, CryovialBoxDetail, BoxDetail, BagDetail, SheetDetail (plate/box layout, breadcrumbs, storage theme).
- **ContainerDetail** (`/containers/:id`) – Single container (tube/well) with derivations and edit.
- **Move wizards** – CollectionMove, ContainerMoveMicronix, ContainerMoveCryovial, ContainerMovePapers (same wrapper and theme for cohesive storage workflow).

## Aesthetic: "Modern precision lab" (aligned with dashboard and studies)

The containers and collections pages use the same "modern precision lab" direction as the dashboard and studies: clean, precise, scientific, and approachable. No data or behavior changes; only visual identity and layout.

## Design choices

- **Scoped theme**: All storage styling lives under a `.storage-page` wrapper and in `packages/web/src/styles/storage.css`. Only the listed routes apply this theme; the rest of the app (sidebar, other pages) is unchanged.

- **Token reuse**: Storage pages reuse the same design tokens as dashboard and studies: off-white/slate background (`--dashboard-bg`, `--dashboard-surface`), white cards (`--dashboard-card`), teal accent (`--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`), and cool grays for text (`--dashboard-text`, `--dashboard-text-muted`). Typography: DM Sans (headings), Source Sans 3 (body).

- **Background**: A light 24×24px grid and soft vertical gradient add depth and a lab/technical feel, matching the dashboard and studies.

- **Cards**: Location preview, stats blocks, contents preview, collection cards, and layout sections use `.storage-card` or `.dashboard-card` so they get the shared card style and teal hover border inside `.storage-page`.

- **Lab-oriented touches**:
  - Collection-type badges (micronix plate, cryovial box, box, bag) use consistent, lab-friendly classes: `.storage-badge-plate`, `.storage-badge-cryovial`, `.storage-badge-box`, `.storage-badge-bag`.
  - Location tree: selected state and hover use teal accent instead of generic blue.
  - Stats blocks: metric-card treatment with accent numbers and muted labels.
  - Contents preview on Locations: plain lists replaced with a grid of **clickable collection cards** (type badge, name, barcode, item count) linking to the correct collection detail URL with teal hover border.
  - Collection grid (plate/box layout): optional `theme="storage"` on CollectionGrid for token-based borders and header inside storage pages.
  - **Container detail page**: Lab-oriented layout with identifier → location → quantity → sample → tags → notes (optional audit). Internal SQL container ID is never shown; primary identifiers are barcode (micronix/cryovial/paper when present) and position. Barcode is shown prominently for micronix tubes using `.storage-barcode` in `storage.css` (monospace, scan-friendly). Derived-container cards use position/barcode/type only, not internal ID.

- **Motion**: Staggered reveal on load via `.storage-reveal` and animation-delay. Focus-visible outlines use the teal accent for accessibility.

- **Buttons**: Primary actions use `.storage-btn-primary` (teal); secondary use `.storage-btn-secondary` (muted border).

## Why scoped styles

- **Predictability**: Only the storage/containers/collections routes are affected. Other pages keep their existing look.
- **Maintainability**: One file (`storage.css`) and one wrapper class define the theme. Future storage-page tweaks stay in one place.
- **Consistency with dashboard/studies**: Same pattern as `.dashboard-page` / `.studies-page`; reuse of the same CSS variable names so shared classes like `dashboard-card` and `dashboard-link` work in all contexts.

## Files touched

- `packages/web/src/styles/storage.css` – Storage theme (vars, grid, cards, typography, reveal, form focus, badges, `.storage-barcode` for scan-friendly barcode, grid table, skeleton, hierarchy stats).
- `packages/web/src/pages/Locations.tsx` – Wrapper, import CSS, header/metric cards, search, tree (teal selected/hover), location preview, stats, contents as collection cards, loading/empty, modals.
- `packages/web/src/pages/LocationDetail.tsx` – Wrapper, import CSS, header, summary cards, hierarchy stats, hierarchy tree (teal current), contents sections with storage badges and cards.
- `packages/web/src/pages/MicronixPlateDetail.tsx` – Wrapper, import CSS, breadcrumbs, title, layout card, CollectionGrid theme="storage".
- `packages/web/src/pages/CryovialBoxDetail.tsx` – Wrapper, import CSS, breadcrumbs, title, layout card, CollectionGrid theme="storage".
- `packages/web/src/pages/BoxDetail.tsx` – Wrapper, import CSS, breadcrumbs, stats bar, sheets as storage cards.
- `packages/web/src/pages/BagDetail.tsx` – Wrapper, import CSS, breadcrumbs, stats bar, sheets as storage cards.
- `packages/web/src/pages/SheetDetail.tsx` – Wrapper, import CSS, breadcrumbs, DBS spots card.
- `packages/web/src/pages/ContainerDetail.tsx` – Lab-oriented layout (identifier block, location, quantity with progress, sample, tags, notes, audit); no internal ID; barcode/position as primary identifiers; storage-btn-primary for Edit.
- `packages/web/src/pages/CollectionMove.tsx` – Wrapper, import CSS.
- `packages/web/src/pages/ContainerMoveMicronix.tsx` – Wrapper, import CSS.
- `packages/web/src/pages/ContainerMoveCryovial.tsx` – Wrapper, import CSS.
- `packages/web/src/pages/ContainerMovePapers.tsx` – Wrapper, import CSS.
- `packages/web/src/components/CollectionGrid.tsx` – Optional `theme="storage"` prop for storage-grid-table styling.
- `packages/web/src/components/LocationDetailsSkeleton.tsx` – Optional `className` prop; used with `storage-skeleton` for token-based pulse in storage theme.
- `design/containers-collections-redesign.md` – This rationale document.
