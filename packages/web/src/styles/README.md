# Design tokens

The SampleDB web app uses a single set of design tokens for colors and typography. All themed pages, floating UI, and modals share these tokens so the interface stays consistent.

This page is for people changing the web app. Lab staff do not need it. Theme choice lives in **Application Settings → Appearance**.

## Where tokens live

Tokens are defined in `tokens.css`. That file is imported once from `index.css`, so every page and component has access to the same variables. Tokens are defined on `:root` as CSS custom properties with the `--app-*` prefix.

## Using tokens in CSS

```css
.my-component {
  background: rgb(var(--app-card));
  color: rgb(var(--app-text));
  border: 1px solid rgb(var(--app-border));
}

.my-component:hover {
  background: rgb(var(--app-accent-muted));
  color: rgb(var(--app-accent-on-tint));
}
```

Values are stored as space-separated RGB (for example `248 250 252`) so you can use them with `rgb(var(--app-bg))` and with alpha: `rgb(var(--app-accent) / 0.5)`.

## Available tokens

**Surfaces:** `--app-bg`, `--app-surface`, `--app-card`

**Accent:** `--app-accent`, `--app-accent-hover`, `--app-accent-muted`, `--app-accent-on-tint`. For search-match chips (plate/box pickers, location tree, command palette), use `bg-app-accent-muted` plus `text-app-accent-on-tint` instead of fixed yellow. For focused grid cells, use `ring-app-accent`, `bg-app-accent-muted`, and `text-app-accent-on-tint` so labels stay readable in dark themes.

**Text:** `--app-text`, `--app-text-muted`

**Border:** `--app-border`

**Semantic:** `--app-trend-up`, `--app-trend-down`, `--app-badge`, `--app-badge-bg`, `--app-standard`, `--app-standard-muted`

**Selection:** `--app-selection-bg`, `--app-selection-fg` for `::selection`.

**Typography:** `--app-font-sans`, `--app-font-display`, `--app-font-mono`

## Tailwind utilities

The app wires these tokens into Tailwind v4 via an `@theme` block in `index.css`.

- Colors: `bg-app-bg`, `text-app-accent`, `ring-app-accent`, `border-app-border`
- Fonts: `font-sans`, `font-display`, `font-mono` (these map to the app token font stacks)

Global form controls (`.form-input`, `.form-select`, `.form-textarea`) use the app accent for focus.

## Adding or changing tokens

Edit `tokens.css`. If the token should be a Tailwind utility, add the corresponding `--color-*` or `--font-*` entry in the `@theme` block in `index.css`. Do not redefine tokens in page-level CSS.

## Themes

The app supports eight themes. Each theme uses the same token names; values come from `:root` (light) or from `[data-theme="…"]` blocks in `tokens.css`.

**Theme options:** Light (default), Dark, Sepia, Ocean, Warm dark, High contrast, Forest, Rose.

- Theme selector: the theme control in the bottom-right floating cluster, or **Application Settings → Appearance**.
- Persistence: a blocking script in `index.html` sets `document.documentElement.dataset.theme` from `localStorage` before first paint.
- Charts: `--app-chart-1` through `--app-chart-8`. See `packages/web/src/lib/chart-colors.ts`.
