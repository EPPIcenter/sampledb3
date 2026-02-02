# Sidebar Redesign Rationale

## Goal

Redesign the app navigation sidebar to be modern, lab-oriented, and visually attractive while staying cohesive with the existing "modern precision lab" theme used on the dashboard, storage, qPCR, and settings pages. The sidebar should feel like part of the same command center, not a separate generic nav.

## Typography

- **Section titles and logo**: DM Sans (same as dashboard headings). Uppercase, letter-spacing for section labels; clear hierarchy for the SampleDB logo.
- **Nav labels**: Source Sans 3 (body font used across themed pages). Keeps readability and consistency with the rest of the app.

Fonts are loaded in the sidebar stylesheet via the same Google Fonts import as dashboard.css.

## Color

Reuse the same palette via CSS variables scoped to `.app-sidebar`:

- **Background**: Off-white/slate surface (`--dashboard-surface`) with optional very subtle vertical gradient for depth.
- **Border**: Cool gray (`--dashboard-border`) on the right edge.
- **Text**: Slate primary (`--dashboard-text`), muted for section titles (`--dashboard-text-muted`).
- **Active state**: Teal accent (`--dashboard-accent`) — left border (2px) + light teal background (`--dashboard-accent-muted`) so the current page is obvious.
- **Hover**: Light surface or light teal tint so hover feels responsive without competing with active.
- **Logo**: Teal for "SampleDB" to align with the app accent.

No blue; teal is the single accent across the app.

## Layout

- **Width**: Keep 208px (`w-52`). No change to main content margin (`lg:ml-52`). Documented here so future tweaks (e.g. 224px) can be done in one place if desired.
- **Spacing**: Section titles have small margin so sections breathe; nav items use consistent padding; footer has same padding as header for balance.

## Visual details

- **Background**: Sidebar surface uses `rgb(var(--dashboard-surface))` or a very subtle vertical gradient (slightly lighter at top) for depth without distraction.
- **Active state**: Teal left border (2px) + light teal background; sub-items use the same logic with indentation.
- **Section dividers**: Section titles alone provide hierarchy; no heavy dividers to keep the sidebar clean.
- **Motion**: Hover uses `transition-colors`; chevron rotation for expand/collapse is already in JS and kept. No extra animation unless we add a subtle hover transition in CSS.

## Mobile

- **Overlay**: Backdrop slate/black with opacity and optional blur, consistent with lab theme; class `app-sidebar__overlay` for styling.
- **Mobile menu button**: Styled with class `app-sidebar__mobile-trigger` in sidebar.css so the floating trigger (in App.tsx) uses the same surface/border/teal hover as the sidebar, making opening the menu feel cohesive.

## Accessibility

- **Focus visible**: All nav links and buttons get `outline` using `--dashboard-accent` on `:focus-visible` so keyboard users see a clear focus ring. Contrast meets WCAG for teal on light background.
- **aria-label**: Existing open/close button labels kept; no change to focus management.

## Files and scope

- **design/sidebar-redesign-rationale.md** (this file): Rationale and decisions.
- **packages/web/src/styles/sidebar.css**: All sidebar visual design scoped to `.app-sidebar` and `.app-sidebar__overlay`, `.app-sidebar__mobile-trigger`.
- **packages/web/src/components/Sidebar.tsx**: Structure and behavior unchanged; add `app-sidebar` and semantic BEM-like classes; styling comes from sidebar.css.
- **packages/web/src/App.tsx**: Import sidebar.css once; add `app-sidebar__mobile-trigger` to the mobile menu button.

Out of scope: collapsible/icon-only sidebar, nav structure changes, moving EPPIcenter or logo, dark mode.
