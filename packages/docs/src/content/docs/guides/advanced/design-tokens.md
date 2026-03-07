---
title: Design Tokens
description: Where theme tokens live and how to use them in the SampleDB web app
---

The SampleDB web app uses a single set of **design tokens** for colors and typography. All themed pages, floating UI, and modals share these tokens so the interface stays consistent.

## Where tokens live

Tokens are defined in **`packages/web/src/styles/tokens.css`**. That file is imported once from `index.css`, so every page and component has access to the same variables. Tokens are defined on `:root` as CSS custom properties with the `--app-*` prefix.

## Using tokens in CSS

Use the token variables anywhere in your CSS (including page-specific stylesheets):

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

Values are stored as **space-separated RGB** (e.g. `248 250 252`) so you can use them with `rgb(var(--app-bg))` and with alpha: `rgb(var(--app-accent) / 0.5)`.

## Available tokens

**Surfaces:** `--app-bg`, `--app-surface`, `--app-card`  
**Accent:** `--app-accent`, `--app-accent-hover`, `--app-accent-muted`, `--app-accent-on-tint`  
**Text:** `--app-text`, `--app-text-muted`  
**Border:** `--app-border`  
**Semantic:** `--app-trend-up`, `--app-trend-down`, `--app-badge`, `--app-badge-bg`, `--app-standard`, `--app-standard-muted`  
**Typography:** `--app-font-sans`, `--app-font-display`, `--app-font-mono`

## Tailwind utilities

The app wires these tokens into Tailwind v4 via an `@theme` block in `index.css`. You can use utility classes such as:

- **Colors:** `bg-app-bg`, `text-app-accent`, `ring-app-accent`, `border-app-border`, etc.
- **Fonts:** `font-sans`, `font-display`, `font-mono` (these map to the app token font stacks)

Global form controls (`.form-input`, `.form-select`, `.form-textarea`) use the app accent for focus (e.g. `focus:ring-app-accent`), so form focus is consistent across the app.

## Adding or changing tokens

To add a new token or change a value, edit `packages/web/src/styles/tokens.css`. If the token should be available as a Tailwind utility, add the corresponding `--color-*` or `--font-*` entry in the `@theme` block in `index.css`. Do not redefine tokens in page-level CSS; reference the global `--app-*` variables so theme switches only need to update the tokens file.

## Dark mode

The app supports an optional **dark theme**. When dark mode is active, the same token names are used but their values come from an `[data-theme="dark"]` block in `tokens.css`. No component code needs to change: everything that uses `var(--app-*)` or the Tailwind token utilities automatically uses the dark palette.

- **Toggle:** Use the theme control in the bottom-right floating action cluster (hover to expand, then click the sun/moon “Dark” or “Light” button). The choice is stored in `localStorage` under the key `theme` and applied on the next load.
- **Persistence:** A small script in `index.html` runs before the app and sets `document.documentElement.dataset.theme` from `localStorage`, so the correct theme is applied immediately and avoids a flash of the wrong theme.
- **Charts:** Dashboard and statistics charts use the `--app-chart-1` … `--app-chart-8` tokens so pie, bar, and line charts stay readable in both themes. See `packages/web/src/lib/chart-colors.ts` for reading these in JavaScript.
