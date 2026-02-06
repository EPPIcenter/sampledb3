# Collection Tree Picker Redesign

## Goal

Improve usability of the collection tree picker so users can expand and collapse location rows without aiming at a small icon. The entire location row is the expand/collapse target, with a minimum touch target height and clear accessibility.

## Problem

- **CollectionTreePicker** and **CollectionMoveTreePicker** used a small chevron or icon (16–20px) as the only obvious expand control; vertical padding was minimal (`py-1.5`). Users had to click a very small area to expand.
- Touch targets fell short of the 44px minimum often recommended for accessibility and touch devices.

## Decision: Full row as expand target

- **One interactive element per location**: The full location row is a single button (or button-like control). Clicking or tapping anywhere on the row toggles expand/collapse.
- **Minimum touch target**: Rows use `min-height: 44px` and comfortable padding (`py-3 px-3` or `px-4`).
- **Chevron as indicator**: The chevron (or caret) on the left indicates expanded/collapsed state only; it is not a separate control. Icon size increased to 20px (e.g. `w-5 h-5`) for clarity.
- **Accessibility**: Each location row has `aria-expanded`, `aria-label` (e.g. "Expand Building" / "Collapse Building"), and supports keyboard (Enter/Space). Focus-visible uses the storage theme teal ring when inside `.storage-page`.

## Touch target rationale

- **44px minimum**: Aligns with WCAG 2.2 Target Size (Success Criterion 2.5.8) and common touch guidelines (e.g. Apple HIG, Material) so the control is usable on touch devices and for users with limited dexterity.
- **Full row**: Reduces precision required; users can tap the row anywhere instead of a small icon.

## Scope

- **CollectionTreePicker** ([packages/web/src/components/CollectionTreePicker.tsx](packages/web/src/components/CollectionTreePicker.tsx)): Used in ContainerMovePapers for source and destination collection selection.
- **CollectionMoveTreePicker** ([packages/web/src/components/CollectionMoveTreePicker.tsx](packages/web/src/components/CollectionMoveTreePicker.tsx)): Used in CollectionMove for multi-select by location.
- **LocationTreePicker** ([packages/web/src/components/LocationTreePicker.tsx](packages/web/src/components/LocationTreePicker.tsx)): Multi-select location picker in a modal; same full-row expand and 44px target.
- **LocationPicker** ([packages/web/src/components/LocationPicker.tsx](packages/web/src/components/LocationPicker.tsx)): Single-select location picker in a modal; same full-row expand, 44px target, and dedicated Select button per row.
- **Storage theme**: Optional class `.storage-tree-picker-row` in [packages/web/src/styles/storage.css](packages/web/src/styles/storage.css) for consistent min-height, hover, and focus-visible when the picker is used inside `.storage-page`.

## Consistency

Both pickers use the same location-row pattern: full-width expand control, min-height 44px, generous padding, chevron as state indicator. Collection rows (single-select buttons or checkbox labels) also use adequate padding (e.g. `min-h-[44px]`, `py-3`) where applicable.

## References

- [design/containers-collections-redesign.md](containers-collections-redesign.md) — storage theme and move wizards
- [design/dashboard-redesign-rationale.md](dashboard-redesign-rationale.md) — design tokens
