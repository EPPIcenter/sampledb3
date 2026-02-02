# Floating Actions and Palettes Redesign

## Goal

Redesign the bottom-right hover button cluster (user switcher, command palette, search), the Search modal, and the Command palette to use the app’s existing **modern precision lab** theme (teal accent, DM Sans / Source Sans 3, slate palette) and to feel like a cohesive, lab-oriented command center. See [sidebar-redesign-rationale.md](sidebar-redesign-rationale.md) for the shared rationale.

## Token reuse

The same design tokens used in the sidebar, dashboard, and storage pages are exposed for floating UI and palettes via **`:root`** in `packages/web/src/styles/floating-palettes.css` under the `--palette-*` names (so they work when modals are rendered outside `.dashboard-page` or `.app-sidebar`):

- **Background / surface**: `--palette-bg`, `--palette-surface`, `--palette-card`
- **Accent**: `--palette-accent`, `--palette-accent-hover`, `--palette-accent-muted`
- **Text**: `--palette-text`, `--palette-text-muted`
- **Border**: `--palette-border`

Typography: DM Sans for headings/section titles, Source Sans 3 for body and controls. No blue; teal is the single accent.

## Scope

### 1. Floating action cluster (App.tsx)

- **Collapsed state**: Lab-themed trigger (surface, border, teal hover/focus) with three-dot icon; `aria-expanded` and `aria-label` preserved.
- **Expanded state**: UserSwitcher, Command button, Search button use `floating-actions__btn` (and UserSwitcher uses `user-switcher__*` classes). Same surface/border and teal hover/focus. Staggered expand animation and 300ms collapse delay unchanged.

### 2. UserSwitcher

- Trigger: `user-switcher__trigger`; avatar uses teal (`user-switcher__avatar`).
- Dropdown: `user-switcher__dropdown` with theme surface/border; section title `user-switcher__section-title`; list items `user-switcher__item`; current user `user-switcher__item--current` (teal left border + light teal background); logout `user-switcher__logout` (red semantics).
- Password dialog: `palette-dialog-overlay` and `palette-dialog-panel`; inputs and buttons use `palette-dialog-input`, `palette-dialog-btn-primary`, `palette-dialog-btn-secondary`, `palette-dialog-error`.

### 3. SearchModal

- Overlay: `palette-overlay` and `palette-overlay__backdrop` (slate/black with opacity and blur).
- Panel: `palette-panel` and `palette-panel__inner`; input in `palette-input-wrap` with `palette-input` and optional `palette-input-spinner`.
- Results: `palette-results`; group titles `palette-group-title`; list `palette-list`; items `palette-item` and `palette-item--selected` (teal left border + light teal background); type badges keep distinct colors; empty states `palette-empty`.
- Footer: `palette-footer` with `palette-footer__hints` and `palette-kbd`.

### 4. CommandPalette

- Same overlay and panel structure as SearchModal; same input, list, and footer classes.
- Command rows: `palette-item` and `palette-item--selected`; query highlight uses `<mark>` styled by `.palette-item mark` (teal-muted highlight).

## Files

| File | Role |
|------|------|
| `packages/web/src/styles/floating-palettes.css` | Tokens and all classes for floating actions, UserSwitcher, dialogs, and palettes |
| `packages/web/src/App.tsx` | Import CSS; floating cluster markup with `floating-actions`, `floating-actions__trigger`, `floating-actions__expanded`, `floating-actions__btn` |
| `packages/web/src/components/UserSwitcher.tsx` | `user-switcher__*` and `palette-dialog-*` classes |
| `packages/web/src/components/SearchModal.tsx` | `palette-overlay`, `palette-panel`, `palette-input`, `palette-item`, `palette-footer`, etc. |
| `packages/web/src/components/CommandPalette.tsx` | Same palette classes; `<mark>` for query highlight |

## Accessibility

- Focus-visible rings use teal (`--palette-accent`). Contrast for teal on light background remains WCAG-friendly.
- `aria-label`, `aria-expanded`, and `aria-hidden` where appropriate are unchanged. Password dialog has `role="dialog"` and `aria-labelledby` / `aria-modal="true"`.

## Out of scope

- Changing hotkeys (⌘K, ⌘⇧K) or the command list.
- Changing search API or result structure.
- Dark mode or new features (e.g. recent searches).
- Moving the floating cluster (stays bottom-right).
