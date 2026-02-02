# Subject and Specimen Pages Redesign Rationale

## Aesthetic: "Modern precision lab" (aligned with dashboard and studies)

The Subject detail and Specimen list/detail/new pages were redesigned to match the existing dashboard and studies "modern precision lab" aesthetic: clean, precise, scientific, and approachable. The goal was a consistent visual identity across dashboard, studies, subject, and specimen without changing any data or behavior.

## Scope

- **Subject**: SubjectDetail only (subjects are listed under Study detail).
- **Specimen**: Specimens (list), SpecimenDetail, SpecimenNew.

Four pages total. Study list/detail/new were already redesigned; this extends the same system to subject and specimen.

## Design choices

- **Scoped theme**: All subject/specimen styling lives under a `.subject-specimen-page` wrapper and in `packages/web/src/styles/subject-specimen.css`. Only the four routes (/subjects/:id, /specimens, /specimens/new, /specimens/:id) apply this theme.

- **Token reuse**: Subject/specimen pages reuse the same design tokens as dashboard and studies: off-white/slate background (`--dashboard-bg`, `--dashboard-surface`), white cards (`--dashboard-card`), teal accent (`--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`), and cool grays for text (`--dashboard-text`, `--dashboard-text-muted`). Typography: DM Sans (headings), Source Sans 3 (body).

- **Background**: A light 24×24px grid and soft vertical gradient add depth and a lab/technical feel, matching the dashboard and studies.

- **Cards**: Summary blocks, Details/Source cards, Containers section, timeline, and table use `.dashboard-card` or `.studies-card` so they get the shared card style and teal hover border when inside `.subject-specimen-page`.

- **Lab-oriented touches**: Specimen-type badges and metric icons use the teal accent; summary metric rows use token text/muted. Container cards on SpecimenDetail use `.studies-card` for a clear hover state. Links use `.dashboard-link` for accent color.

- **Buttons**: Primary (Add Specimen, New Specimen) use `.subject-specimen-btn-primary` (teal); secondary (Edit Subject) uses `.subject-specimen-btn-secondary` (muted border).

- **Motion**: Staggered reveal on load via `subject-specimen-reveal` and animation-delay. Focus-visible outlines use the teal accent for accessibility.

- **DataTable**: Optional `className` prop was added so Specimens can pass `dashboard-card overflow-hidden` and get the themed card look without double wrappers.

## Why scoped styles

- **Predictability**: Only the subject and specimen routes are affected. Other pages keep their existing look.
- **Maintainability**: One file (`subject-specimen.css`) and one wrapper class define the theme. Future subject/specimen-page tweaks stay in one place.
- **Consistency with dashboard/studies**: The same pattern as `.dashboard-page` / `.studies-page`: reuse the same CSS variable names so that shared classes like `dashboard-card` and `dashboard-link` work in all contexts.

## Files touched

- `packages/web/src/styles/subject-specimen.css` – new; subject/specimen theme (vars, grid, cards, typography, reveal, form focus, breadcrumb, buttons).
- `packages/web/src/pages/SubjectDetail.tsx` – wrapper, import CSS, card/section/link/button classes, staggered reveal.
- `packages/web/src/pages/Specimens.tsx` – wrapper, import CSS, header/filter/table card classes, DataTable className, staggered reveal.
- `packages/web/src/pages/SpecimenDetail.tsx` – wrapper, import CSS, card and link classes, container cards as studies-card, staggered reveal.
- `packages/web/src/pages/SpecimenNew.tsx` – wrapper, import CSS, card and form container classes, staggered reveal.
- `packages/web/src/components/DataTable.tsx` – optional `className` prop for root div.
