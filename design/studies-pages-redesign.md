# Studies Pages Redesign Rationale

## Aesthetic: "Modern precision lab" (aligned with dashboard)

The Studies list, Study detail, and Study new pages were redesigned to match the existing dashboard and qPCR "modern precision lab" aesthetic: clean, precise, scientific, and approachable. The goal was a consistent visual identity across dashboard and studies without changing any data or behavior.

## Design choices

- **Scoped theme**: All studies styling lives under a `.studies-page` wrapper and in `packages/web/src/styles/studies.css`. The rest of the app (sidebar, other pages) is unchanged. Only the three studies routes (/studies, /studies/new, /studies/:id) apply this theme.

- **Token reuse**: Studies pages reuse the same design tokens as the dashboard: off-white/slate background (`--dashboard-bg`, `--dashboard-surface`), white cards (`--dashboard-card`), teal accent (`--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`), and cool grays for text (`--dashboard-text`, `--dashboard-text-muted`). Typography: DM Sans (headings), Source Sans 3 (body).

- **Background**: A light 24×24px grid and soft vertical gradient add depth and a lab/technical feel, matching the dashboard.

- **Cards**: Study list cards (StudyCard), empty/loading states, and detail content use `.studies-card` or `.dashboard-card` so that when rendered inside `.studies-page` they get the shared card style and teal hover border.

- **Motion**: Staggered reveal on the Studies list (header, filters, content) via `studies-reveal` and animation-delay. Focus-visible outlines use the teal accent for accessibility.

- **Components**: StatCard and StatChart accept optional `className` / `cardClassName` so Study detail can pass `dashboard-card p-6` and have overview stats and charts match the studies theme. StudyStats accepts optional `statCardClassName` and `cardClassName` and passes them through.

## Why scoped styles

- **Predictability**: Only the studies routes are affected. Other pages keep their existing look.
- **Maintainability**: One file (`studies.css`) and one wrapper class define the theme. Future studies-page tweaks stay in one place.
- **Consistency with dashboard**: The dashboard already uses a scoped `.dashboard-page` and `dashboard.css`. Studies follows the same pattern with `.studies-page` and `studies.css`, reusing the same CSS variable names so that shared classes like `dashboard-card` work in both contexts.

## Files touched

- `packages/web/src/styles/studies.css` – new; studies theme (vars, grid, cards, typography, reveal, form focus).
- `packages/web/src/pages/Studies.tsx` – wrapper, import CSS, header/filters/empty/loading styles.
- `packages/web/src/pages/StudyDetail.tsx` – wrapper, import CSS, header/tabs/cards/modals, StudyStats classNames.
- `packages/web/src/pages/StudyNew.tsx` – wrapper, import CSS, form container.
- `packages/web/src/components/StudyCard.tsx` – studies-card and palette (badges, links, metrics).
- `packages/web/src/components/StudyCardSkeleton.tsx` – studies-card and pulse colors.
- `packages/web/src/components/StatCard.tsx` – optional `className` prop.
- `packages/web/src/components/StudyStats.tsx` – optional `statCardClassName` and `cardClassName`, passed to StatCard/StatChart and to Study Period / Bin Size wrappers.
