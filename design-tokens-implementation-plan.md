# Design Tokens Implementation Plan

This document describes a phased plan to introduce a single source of truth for design tokens (colors, typography) in the SampleDB web app, align form focus with the app accent, and reduce duplication across page-specific CSS.

---

## 1. Current State

### 1.1 Token duplication

- **Same palette redefined in many files:** The variables `--dashboard-bg`, `--dashboard-surface`, `--dashboard-card`, `--dashboard-accent`, `--dashboard-accent-hover`, `--dashboard-accent-muted`, `--dashboard-text`, `--dashboard-text-muted`, `--dashboard-border` (and in some files `--dashboard-trend-up`, `--dashboard-trend-down`) appear in:
  - `dashboard.css`, `sidebar.css`, `settings.css`, `statistics.css`, `studies.css`, `storage.css`, `blood-controls.css`, `admin.css`, `reference-data.css`, `profile.css`, `subject-specimen.css`
- **Alternate prefixes for the same semantics:** `qpcr.css` uses `--qpcr-accent`, `--qpcr-surface`, etc.; `floating-palettes.css` uses `--palette-*` on `:root` so floating UI (rendered outside page wrappers) can use them.
- **Semantic extras:** `storage.css` adds `--dashboard-accent-on-tint`; `blood-controls.css` adds `--blood-controls-badge`, `--blood-controls-badge-bg`.

### 1.2 Form focus inconsistency

- **Global forms** (`index.css`): `.form-input`, `.form-select`, `.form-textarea` use Tailwind `focus:ring-blue-500` / `focus:border-blue-500`.
- **Rest of app:** File inputs, dashboard links, and page-level overrides use teal (e.g. `rgb(20 184 166)`). Many page CSS files override `.form-input:focus` and similar to teal within their wrapper (e.g. `.storage-page .form-input:focus`).

### 1.3 Typography

- **Body** (`index.css`): System font stack.
- **Themed pages:** Each themed CSS file that needs it imports Google Fonts and sets e.g. `font-family: 'Source Sans 3'` on the page wrapper and `'DM Sans'` on headings. The same `@import` appears in `dashboard.css`, `qpcr.css`, `floating-palettes.css` (and likely others).

### 1.4 Tailwind

- `tailwind.config.js` has empty `theme.extend`. No design tokens are exposed to Tailwind; colors and fonts are hardcoded in CSS or use raw Tailwind names (e.g. `blue-500`, `gray-100`).

### 1.5 Page wrappers

- Pages use wrapper classes for scoped theming: `.dashboard-page`, `.storage-page`, `.studies-page`, `.admin-page`, `.profile-page`, `.subject-specimen-page`, `.qpcr-theme`, etc. Tokens are often defined on that wrapper, so only that subtree uses them. Floating UI and modals live outside these wrappers, which is why `floating-palettes.css` puts `--palette-*` on `:root`.

---

## 2. Target State

- **Single tokens file** defining all app theme variables on `:root`, so every context (pages, floating UI, modals) uses the same values.
- **No duplicate variable blocks** in page CSS; page files only reference the global tokens and define page-specific layout/component styles.
- **Form focus** uses the app accent everywhere (global forms and any remaining overrides).
- **One font load** and typography tokens; page CSS references them instead of redefining font stacks.
- **Tailwind** `theme.extend` optionally wired to the same tokens for utility classes (e.g. `bg-app-bg`, `ring-app-accent`).
- **Future-ready:** Token set structured so a later dark mode only needs to swap values (e.g. in `[data-theme="dark"]` or `@media (prefers-color-scheme: dark)`).

---

## 3. Token Set (Proposed)

All values are space-separated RGB so we can use `rgb(var(--app-*))` and `rgb(var(--app-*) / 0.5)` for alpha.

| Token | Current value (light) | Purpose |
|-------|----------------------|--------|
| `--app-bg` | `248 250 252` | Page background |
| `--app-surface` | `241 245 249` | Raised surface (e.g. sidebar) |
| `--app-card` | `255 255 255` | Card background |
| `--app-accent` | `20 184 166` | Primary accent (teal) |
| `--app-accent-hover` | `13 148 136` | Accent hover |
| `--app-accent-muted` | `204 251 241` | Accent tint (e.g. file button bg) |
| `--app-accent-on-tint` | `19 78 74` | Text on accent tint (optional; used in storage) |
| `--app-text` | `30 41 59` | Primary text |
| `--app-text-muted` | `100 116 139` | Secondary text |
| `--app-border` | `226 232 240` | Borders |
| `--app-trend-up` | `34 197 94` | Positive / up |
| `--app-trend-down` | `239 68 68` | Negative / down |
| `--app-badge` | `190 18 60` | Badge text (e.g. blood controls) |
| `--app-badge-bg` | `255 228 230` | Badge background |
| `--app-standard` | `245 158 11` | qPCR “standard” pill (optional; could stay in qpcr.css) |
| `--app-standard-muted` | `254 243 199` | qPCR standard muted bg |

**Typography:**

| Token | Value | Purpose |
|-------|--------|--------|
| `--app-font-sans` | `'Source Sans 3', ui-sans-serif, system-ui, sans-serif` | Body / UI |
| `--app-font-display` | `'DM Sans', ui-sans-serif, system-ui, sans-serif` | Headings |
| `--app-font-mono` | `ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace` | Barcodes, code (optional) |

Fonts must be loaded once; the plan uses a single `@import` in the tokens file (or `index.html`).

---

## 4. File Layout

```
packages/web/
  src/
    index.css                    # Imports tokens + global components (form-input, etc.)
    styles/
      tokens.css                 # NEW: :root { ... } + optional dark block
      dashboard.css              # No variable definitions; uses var(--app-*)
      sidebar.css
      settings.css
      statistics.css
      studies.css
      storage.css
      blood-controls.css
      admin.css
      reference-data.css
      profile.css
      subject-specimen.css
      qpcr.css
      floating-palettes.css
  tailwind.config.js             # theme.extend colors + fontFamily from vars
```

- **Entry point:** `main.tsx` already imports `./index.css`. `index.css` will `@import './styles/tokens.css'` (or the tokens file is imported by a shared layout; the minimal change is import from `index.css` so tokens are always loaded).

---

## 5. Implementation Phases

### Phase 1: Add tokens file and load it (no visual change)

**Goal:** Introduce `tokens.css` and load it; existing CSS still uses its own variables. This avoids a big-bang switch.

1. **Create `packages/web/src/styles/tokens.css`**
   - Add `@import` for Google Fonts (DM Sans, Source Sans 3) once.
   - Define `:root { ... }` with all `--app-*` variables above (colors + typography).
   - Do not remove or change any existing page CSS yet.

2. **Import tokens in `index.css`**
   - At the top: `@import './styles/tokens.css';`
   - Ensure tokens load before Tailwind and component styles.

3. **Verify**
   - Build and run the app; no visual change.
   - In DevTools, confirm `:root` has `--app-bg`, `--app-accent`, etc.

**Deliverable:** Tokens exist and are available everywhere; no references to them yet.

---

### Phase 2: Fix global form focus (index.css)

**Goal:** Global form controls use the app accent for focus so they match the rest of the UI.

1. **In `index.css`, update `.form-input`, `.form-select`, `.form-textarea`**
   - Replace `focus:ring-blue-500 focus:border-blue-500` with focus styles that use the accent, e.g.:
     - `focus:ring-2 focus:ring-[rgb(var(--app-accent))] focus:border-[rgb(var(--app-accent))]`
   - Or, once Tailwind is extended (Phase 4), use something like `focus:ring-app-accent focus:border-app-accent` if you add `ringColor`/`borderColor` from theme.

2. **Optionally refactor file-input classes** in `index.css` to use `var(--app-accent)`, `var(--app-accent-muted)`, `var(--app-accent-on-tint)` instead of hardcoded teal values.

3. **Verify**
   - Focus an input/select/textarea on a page that doesn’t override form focus; ring and border should be teal.

**Deliverable:** Global form focus uses app accent; one less inconsistency.

---

### Phase 3: Migrate one page to tokens (pilot)

**Goal:** Prove the migration pattern on one page without breaking others.

1. **Choose a pilot:** e.g. `dashboard.css` (small, well-defined wrapper).

2. **In `dashboard.css`:**
   - Remove the entire block that defines `--dashboard-*` (and the duplicate `@import` for fonts if present).
   - Replace every `var(--dashboard-bg)` with `var(--app-bg)`, `var(--dashboard-accent)` with `var(--app-accent)`, etc. (search-and-replace or manual).
   - Set `font-family` on `.dashboard-page` to `var(--app-font-sans)`; headings to `var(--app-font-display)`.

3. **Verify**
   - Dashboard page looks identical; no regressions. Floating UI and other pages unchanged.

**Deliverable:** One page fully on tokens; pattern documented for the rest.

---

### Phase 4: Wire Tailwind to tokens (optional but recommended)

**Goal:** Use Tailwind utilities with token-based colors and fonts so new code and overrides can use classes like `bg-app-bg`, `text-app-accent`, `font-app-sans`.

1. **In `tailwind.config.js`, extend theme:**
   - **Colors:** Add an `app` (or `theme`) object so that `bg-app-bg` resolves to `rgb(var(--app-bg))`, etc. Tailwind v4 can use CSS variables in theme; for v3 you may need to define each as e.g. `'rgb(var(--app-bg))'` or use a plugin that reads from `:root`.
   - **Font family:** `fontFamily: { sans: ['var(--app-font-sans)'], display: ['var(--app-font-display)'] }` (or keep default sans and add `display` only).
   - Exact syntax depends on your Tailwind major version; the idea is that utilities reference the same CSS variables as the tokens file.

2. **Use in index.css for form focus**
   - If you added `ringColor.app-accent`, you can switch the form classes to `focus:ring-app-accent focus:border-app-accent` (or the equivalent in your setup).

3. **Verify**
   - Build; run app; confirm a sample of utilities (e.g. a test page or the dashboard) render with the right colors/fonts.

**Deliverable:** Tailwind and tokens aligned; form focus can use Tailwind token-based classes.

---

### Phase 5: Migrate remaining page CSS files

**Goal:** Remove all duplicate variable definitions and standardize on `--app-*`.

1. **For each of:** `sidebar.css`, `settings.css`, `statistics.css`, `studies.css`, `storage.css`, `blood-controls.css`, `admin.css`, `reference-data.css`, `profile.css`, `subject-specimen.css`:
   - Remove the local `--dashboard-*` (or `--palette-*`, `--qpcr-*`) variable block and any duplicate `@import` for fonts.
   - Replace all `var(--dashboard-*)` with `var(--app-*)` using the mapping below.
   - Replace `--palette-*` and `--qpcr-*` with the corresponding `--app-*`.
   - Set wrapper `font-family` to `var(--app-font-sans)` and heading font to `var(--app-font-display)` where applicable.

2. **Mapping (old → new):**
   - `--dashboard-bg` → `--app-bg`
   - `--dashboard-surface` → `--app-surface`
   - `--dashboard-card` → `--app-card`
   - `--dashboard-accent` → `--app-accent`
   - `--dashboard-accent-hover` → `--app-accent-hover`
   - `--dashboard-accent-muted` → `--app-accent-muted`
   - `--dashboard-accent-on-tint` → `--app-accent-on-tint` (ensure it exists in tokens.css)
   - `--dashboard-text` → `--app-text`
   - `--dashboard-text-muted` → `--app-text-muted`
   - `--dashboard-border` → `--app-border`
   - `--dashboard-trend-up` → `--app-trend-up`
   - `--dashboard-trend-down` → `--app-trend-down`
   - `--blood-controls-badge` → `--app-badge`
   - `--blood-controls-badge-bg` → `--app-badge-bg`
   - `--palette-*` → same as dashboard (e.g. `--palette-bg` → `--app-bg`)
   - `--qpcr-accent` → `--app-accent`; `--qpcr-surface` → `--app-bg` or `--app-surface`; `--qpcr-surface-card` → `--app-card`; `--qpcr-text` → `--app-text`; `--qpcr-text-muted` → `--app-text-muted`; keep `--qpcr-standard` / `--qpcr-standard-muted` in qpcr.css or add `--app-standard` / `--app-standard-muted` to tokens if you want them global.

3. **floating-palettes.css**
   - Remove the `:root { --palette-* }` block entirely; all references become `var(--app-*)`.

4. **Page-level blue overrides**
   - Many pages override Tailwind blue (e.g. `.storage-page .focus\:ring-blue-500:focus`) to teal. Once tokens and Tailwind are in place, these can:
     - Stay as overrides but use `rgb(var(--app-accent))` or the new Tailwind token class, or
     - Be removed if you switch the underlying components to use token-based Tailwind classes (e.g. `focus:ring-app-accent`). Prefer doing that in a follow-up pass so Phase 5 stays a mechanical replacement of variable names.

5. **Verify**
   - Full regression pass: every page that previously had the “dashboard” or “palette” or “qpcr” theme looks the same. Floating UI and modals unchanged. No duplicate `@import` for fonts.

**Deliverable:** All themed UI uses `--app-*`; no duplicated token definitions.

---

### Phase 6: Consolidate shared patterns (optional)

**Goal:** Reduce repeated card/link/section-title rules across page CSS files.

1. **Identify patterns:** e.g. “dashboard card” (white card, border, shadow, hover), “section title” (DM Sans, size, weight), “accent link” (teal, hover darker). These appear in dashboard, studies, storage, etc. with the same values.

2. **Options:**
   - **A)** Add a small set of utility classes in `index.css` (e.g. `.app-card`, `.app-section-title`, `.app-link`) that use `var(--app-*)`, and use them in JSX instead of page-specific class names where it makes sense.
   - **B)** Keep page-specific class names but move the shared rules into one “layout” or “components” CSS file that uses tokens and is imported once; page CSS only adds page-specific overrides.

3. **Do not** change component structure or markup in this phase beyond adding/using shared classes; focus on CSS consolidation.

**Deliverable:** Fewer duplicated card/link/title rules; tokens remain the single source of truth.

---

### Phase 7: Dark mode (optional, later)

**Goal:** Support dark theme via the same token names.

1. **In `tokens.css`, add a block:** e.g. `[data-theme="dark"]` or `@media (prefers-color-scheme: dark)` with `:root, [data-theme="dark"]` (or a wrapper class).
2. **Redefine** each `--app-*` color with dark values (e.g. dark background, light text, adjusted accent).
3. **Typography tokens** can stay; only colors need to change.
4. **UI:** If using `data-theme`, add a toggle that sets `document.documentElement.dataset.theme = 'dark' | 'light'` and persists to localStorage.

**Deliverable:** Optional dark theme without changing every page file again.

---

## 6. Example: tokens.css skeleton

```css
/**
 * App design tokens – single source of truth for theme.
 * Import this once (e.g. from index.css). All themed CSS should use var(--app-*).
 */

@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700&display=swap');

:root {
  /* Surfaces */
  --app-bg: 248 250 252;
  --app-surface: 241 245 249;
  --app-card: 255 255 255;
  /* Accent */
  --app-accent: 20 184 166;
  --app-accent-hover: 13 148 136;
  --app-accent-muted: 204 251 241;
  --app-accent-on-tint: 19 78 74;
  /* Text */
  --app-text: 30 41 59;
  --app-text-muted: 100 116 139;
  /* Border */
  --app-border: 226 232 240;
  /* Semantic */
  --app-trend-up: 34 197 94;
  --app-trend-down: 239 68 68;
  --app-badge: 190 18 60;
  --app-badge-bg: 255 228 230;
  /* qPCR / optional */
  --app-standard: 245 158 11;
  --app-standard-muted: 254 243 199;
  /* Typography */
  --app-font-sans: 'Source Sans 3', ui-sans-serif, system-ui, sans-serif;
  --app-font-display: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
  --app-font-mono: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
}
```

---

## 7. Example: Tailwind theme.extend (conceptual)

Tailwind v4 supports CSS-first config; v3 uses JS. Example for v3-style `theme.extend`:

```js
// tailwind.config.js – extend so utilities use tokens
theme: {
  extend: {
    colors: {
      app: {
        bg: 'rgb(var(--app-bg))',
        surface: 'rgb(var(--app-surface))',
        card: 'rgb(var(--app-card))',
        accent: 'rgb(var(--app-accent))',
        'accent-hover': 'rgb(var(--app-accent-hover))',
        'accent-muted': 'rgb(var(--app-accent-muted))',
        text: 'rgb(var(--app-text))',
        'text-muted': 'rgb(var(--app-text-muted))',
        border: 'rgb(var(--app-border))',
        'trend-up': 'rgb(var(--app-trend-up))',
        'trend-down': 'rgb(var(--app-trend-down))',
        badge: 'rgb(var(--app-badge))',
        'badge-bg': 'rgb(var(--app-badge-bg))',
      },
    },
    fontFamily: {
      sans: ['var(--app-font-sans)'],
      display: ['var(--app-font-display)'],
      mono: ['var(--app-font-mono)'],
    },
  },
},
```

Then `bg-app-bg`, `text-app-accent`, `focus:ring-app-accent`, `font-display` etc. work. Ring/border color may need to be added under `ringColor`/`borderColor` if not inherited from `colors`.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Visual regression after replacing variables | Migrate one page first (Phase 3); do a full visual pass after Phase 5. |
| Floating UI or modals not in a wrapper | Tokens on `:root` (Phase 1) so they’re available everywhere. |
| Tailwind build or purge breaks variable usage | Use quoted values or theme paths that resolve at build time; test build and prod. |
| Font loading flash | Single @import in tokens; consider preconnect for Google Fonts in index.html if needed. |
| Page CSS still overrides with blue | Phase 2 fixes global forms; Phase 5 can leave page overrides that now point to `--app-accent`; later replace with Tailwind token classes. |

---

## 9. Validation Checklist

- [ ] `:root` has all `--app-*` tokens and no duplicate definitions in page CSS.
- [ ] Global form focus (input/select/textarea) uses app accent.
- [ ] Every previously themed page looks unchanged after migration.
- [ ] Floating palettes and modals use the same palette as pages.
- [ ] Fonts load once; no duplicate Google Fonts @import.
- [ ] `bun run build` and `bun run lint` pass; no new console errors.
- [ ] Optional: Tailwind utilities for token colors/fonts work; form focus uses them.

---

## 10. Doc and Rules

- **Docs:** After implementation, add a short “Design tokens” section to the docs (e.g. in `packages/docs`) describing where tokens live and how to use them (CSS `var(--app-*)`, optional Tailwind classes). Link from any existing “Styling” or “Development” guide.
- **Cursor/docs rule:** The “docs-in-sync” rule already asks to update docs for new or changed behavior; token consolidation is a styling/architecture change that merits a brief doc update.

---

*Plan version: 1.0. Next step: Phase 1 (add `tokens.css` and import from `index.css`).*
