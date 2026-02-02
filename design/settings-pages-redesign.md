# Settings Pages Redesign Rationale

## Goal

Make the Settings experience modern, lab-oriented, and visually attractive. Only `/settings` and `/admin/settings` are affected. No behavior or API changes.

## Aesthetic: "Modern precision lab"

Same scoped theme as Dashboard, Statistics, and Storage: clean, precise, scientific, and cohesive with the rest of the app.

## Design choices

- **Scoped theme**: All settings styling lives under a `.settings-page` wrapper and in `packages/web/src/styles/settings.css`. Only the Settings route (and Admin Settings, which reuses the same page) is affected.

- **Tokens**: Reuse the same palette as dashboard/storage: off-white/slate background, white cards, teal accent, cool grays for text. Typography: DM Sans for headings, Source Sans 3 for body.

- **Background**: Light 24×24px grid and soft vertical gradient for lab feel, matching dashboard/storage.

- **Nav sidebar**: Category headers and section links use theme colors; active state uses teal (accent-muted background, accent border/color) instead of blue.

- **Form controls**: Inputs and selects inside `.settings-page` get teal focus ring via descendant selectors, so form components do not need markup changes. Primary submit buttons use teal background/hover.

- **Alerts**: Error and success banners use theme-appropriate borders and backgrounds (existing red for error, green/teal tint for success).

- **Loading**: Skeleton uses token-based pulse (`.settings-skeleton`) so it feels part of the theme.

- **Motion**: Optional staggered reveal on load (sidebar, then content card) via `settings-reveal` and animation-delay.

## Why scoped styles

- **Predictability**: Only the Settings route is affected.
- **Maintainability**: One file (`settings.css`) and one wrapper class; future tweaks stay in one place.
- **Consistency**: Same pattern as dashboard, statistics, storage, and qPCR pages.
