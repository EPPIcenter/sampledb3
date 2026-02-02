# Dashboard Redesign Rationale

## Aesthetic: "Modern precision lab"

The dashboard was redesigned to feel like a lab command center: clean, precise, and scientific but approachable. The goal was a clear visual identity without changing any data or behavior.

## Design choices

- **Scoped theme**: All dashboard styling lives under a `.dashboard-page` wrapper and in `packages/web/src/styles/dashboard.css`. The rest of the app (sidebar, other pages) is unchanged. This keeps the dashboard recognizable as "home" while avoiding global style drift.

- **Typography**: DM Sans for headings and Source Sans 3 for body, scoped to `.dashboard-page`. This matches the existing qPCR "precision lab" theme so the app feels cohesive.

- **Color**: CSS variables define the palette: off-white/slate background (`--dashboard-bg`, `--dashboard-surface`), white cards (`--dashboard-card`), teal accent (`--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`), and cool grays for text (`--dashboard-text`, `--dashboard-text-muted`). Teal aligns with qPCR and avoids generic purple-on-white.

- **Background**: A very light grid (24×24px) and a soft vertical gradient add depth and a lab/technical feel without distracting from content.

- **Motion**: Staggered reveal on load (header, then metric cards, then Quick Actions section) via `dashboard-reveal` and `animation-delay`. Hover/focus use consistent transitions; focus-visible outlines use the accent for accessibility.

- **Charts**: System Insights passes a dashboard chart palette (teal + slate) into StatChart so pie/bar/line charts match the dashboard. StatChart accepts an optional `cardClassName` so chart cards use `dashboard-card` when rendered on the dashboard.

## Why scoped styles

- **Predictability**: Only the dashboard route is affected. Other pages keep their existing look.
- **Maintainability**: One file (`dashboard.css`) and one wrapper class define the theme. Future dashboard tweaks stay in one place.
- **Consistency with qPCR**: qPCR pages already use a scoped `.qpcr-theme`. The dashboard follows the same pattern with `.dashboard-page`.
