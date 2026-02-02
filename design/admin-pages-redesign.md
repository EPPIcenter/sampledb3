# Admin Pages Redesign Rationale

## Goal

Redesign the four Admin pages (Dashboard, User Management, System Statistics, Error Logs) to be modern, lab-oriented, and visually attractive, matching the app’s established “modern precision lab” aesthetic. Admin Settings (`/admin/settings`) reuses the existing Settings page and its theme; it was out of scope.

## Aesthetic: "Modern precision lab"

Same as Dashboard, Statistics, Settings, and Storage: clean, precise, scientific, and cohesive. The Admin area reads as a dedicated “system command center” while staying visually consistent with the rest of the app.

## Design choices

- **Scoped theme**: All admin styling lives under a `.admin-page` wrapper and in `packages/web/src/styles/admin.css`. Only the four Admin routes are affected; sidebar and app shell are unchanged.

- **Token reuse**: The same palette as dashboard/statistics/storage: off-white/slate background (`--dashboard-bg`, `--dashboard-surface`), white cards (`--dashboard-card`), teal accent (`--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`), cool grays for text (`--dashboard-text`, `--dashboard-text-muted`), and border (`--dashboard-border`). Typography: DM Sans for headings, Source Sans 3 for body.

- **Background**: Light 24×24px grid and soft vertical gradient via `::before`, matching dashboard/statistics.

- **Components**: `.admin-card` for surfaces (cards, filter bars, table wrappers, modal panels); `.admin-section-title` for section headings; `.admin-btn-primary` (teal) and `.admin-btn-secondary` (neutral) for actions; `.admin-table` for thead/tbody borders and header background; `.admin-reveal` and `.admin-reveal-1` … `-8` for staggered reveal; `.admin-skeleton` for loading pulse. Form controls inside `.admin-page` get teal focus ring via descendant rules.

- **Per-page**: Admin Dashboard uses quick-action cards and stat cards with teal icon containers (no dynamic Tailwind color classes); loading/error states use theme. Admin Users uses themed filters, table, and modals (Create, Edit, Delete, Password, Sessions) with primary/secondary buttons. Admin Statistics uses section cards with explicit teal icon style and “Users by Role” block. Admin Error Logs uses themed filters, table, detail modal (stack/context blocks use `--dashboard-surface`), and cleanup modal; level/source/status badges keep semantic colors (error/warning/info, frontend/backend, resolved/unresolved).

## Why scoped styles

- **Predictability**: Only Admin routes are affected.
- **Maintainability**: One file (`admin.css`) and one wrapper class; future admin tweaks stay in one place.
- **Consistency**: Same pattern as dashboard, statistics, storage, settings, and qPCR pages.

## Files touched

| Area            | File |
|-----------------|------|
| Theme           | `packages/web/src/styles/admin.css` (new) |
| Admin Dashboard | `packages/web/src/pages/AdminDashboard.tsx` |
| Admin Users     | `packages/web/src/pages/AdminUsers.tsx` |
| Admin Statistics| `packages/web/src/pages/AdminStatistics.tsx` |
| Admin Error Logs| `packages/web/src/pages/AdminErrorLogs.tsx` |
| Design          | `design/admin-pages-redesign.md` (this file) |

## References

- [design/dashboard-redesign-rationale.md](dashboard-redesign-rationale.md) — token and aesthetic source
- [design/statistics-page-redesign.md](statistics-page-redesign.md) — scoped theme pattern
