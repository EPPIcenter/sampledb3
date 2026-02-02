# Study Detail Page Redesign Rationale

## Purpose

Redesign the Study Detail page structure and layout to be more intuitive and streamlined: a "study dossier" feel with persistent study identity and key metrics, clearer action hierarchy, and the same "modern precision lab" theme used elsewhere (see [studies-pages-redesign.md](studies-pages-redesign.md)).

## Design direction

- **Tone**: Clean, modern, lab-oriented — scannable, data-dense but organized.
- **Constraints**: Same API and data; keep `.studies-page` and studies.css tokens; preserve all behavior (edit, create subject, merge, export, delete, date filtering, timeline, subjects table).
- **Differentiation**: Sticky study identity + key metrics so context is always visible when scrolling or switching tabs; primary actions (Create Subject, Export) prominent; secondary actions (Edit, Merge) in a dropdown; destructive (Delete) separate.

## Information architecture

| Zone | Content | Rationale |
|------|--------|-----------|
| **Identity strip** (sticky) | Breadcrumbs, study title, shortCode badge, leadPerson (if present), longitudinal badge (if true). Optional one-line description or "No description." | Single place for "what study is this"; always visible when scrolling. |
| **Key metrics bar** (sticky, below identity) | 4 pills: Subjects, Specimens, Containers, Avg/Subject. Values from summary (or placeholders while loading). | At-a-glance counts without opening Overview; reinforces lab context. |
| **Actions** | Primary: "Create Subject", "Export". Secondary (dropdown): "Edit Study", "Merge Subjects". Destructive: "Delete study" (same permission rules). | Fewer visible buttons; primary actions prominent. |
| **Main content** | Tabs (Overview \| Timeline \| Subjects) below identity + metrics; tab content unchanged. | Identity + metrics stay in view; minimal behavior change. |
| **Overview** | Date filter (compact) then StudyStats as today. | Date filter applies to Overview and Timeline. |
| **Timeline** | StudyTimeline scatter; only if `study.isLongitudinal`. | Unchanged. |
| **Subjects** | DataTable + search; "X subjects" label; "Add subject" near table opens same modal. | Same behavior, clearer context. |

## Layout

- **Identity strip**: Breadcrumbs → title (h1) + shortCode pill + "Lead: {leadPerson}" (if present) + "Longitudinal" pill (if true) → description (clamped 1–2 lines with "Show more" to expand) or muted "No description."
- **Key metrics bar**: Horizontal row of 4 compact stat pills; summary loaded in parallel with study so metrics show as soon as study loads (or "—" while loading).
- **Sticky**: Combined header block (identity + metrics + actions) uses `position: sticky; top: 0` with solid background so content does not show through on scroll.
- **Tabs**: Existing tab bar and `?tab=overview|timeline|subjects`; content below unchanged.

## Accessibility and responsiveness

- Focus order: breadcrumbs → title → metrics → actions → tabs → content.
- Actions dropdown: keyboard operable; aria-label "More actions."
- Metrics bar: clear labels (e.g. "Subjects: 12") for screen readers.
- Mobile: stack identity (title, then badges), metrics as 2×2 or wrapped row, actions stacked or in "Actions" menu; tabs horizontal scroll if needed.

## Files touched

- `design/study-detail-redesign.md` — this rationale.
- `packages/web/src/styles/studies.css` — `.study-detail-header`, `.study-detail-identity`, `.study-detail-metrics`, `.study-detail-actions`, `.study-detail-badge`, description clamp, sticky.
- `packages/web/src/pages/StudyDetail.tsx` — uses `StudyDetailHeader`, summary loaded with study; modals and tab content unchanged.
- `packages/web/src/components/StudyDetailHeader.tsx` — identity block, metrics bar, action grouping (primary + dropdown + delete).
- `packages/docs/src/content/docs/guides/workflows/studies.md` — short note on sticky header and key metrics bar.

## References

- [studies-pages-redesign.md](studies-pages-redesign.md) — studies theme and tokens.
- Frontend-design skill — bold aesthetic, lab-oriented, cohesive tokens.
