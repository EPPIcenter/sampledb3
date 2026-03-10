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

## Themes

The app supports eight **themes**. Each theme uses the same token names; values come from `:root` (light) or from `[data-theme="…"]` blocks in `tokens.css`. No component code needs to change: everything that uses `var(--app-*)` or the Tailwind token utilities automatically follows the active theme.

**Theme options:** Light (default), Dark, Sepia (warm, paper-like), Ocean (cool blue), Warm dark (dark with amber tones), High contrast (strong contrast for accessibility), Forest (dark green-toned), Rose (warm soft pink).

- **Theme selector:** Use the theme control in the bottom-right floating action cluster (hover to expand, then click the theme button to open the dropdown). Choose any of the eight themes. You can also change the theme from Settings (Appearance section).
- **Persistence:** A blocking script in `index.html` runs before the app and sets `document.documentElement.dataset.theme` from `localStorage` for any stored value that is one of the theme ids. That way the correct theme is applied on first paint and avoids a flash of the wrong theme on reload.
- **Charts:** Dashboard and statistics charts use the `--app-chart-1` … `--app-chart-8` tokens so pie, bar, and line charts stay readable in every theme. See `packages/web/src/lib/chart-colors.ts` for reading these in JavaScript.
