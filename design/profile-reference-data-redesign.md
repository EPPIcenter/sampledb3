# Profile and Reference Data Page Redesign Rationale

## Goal

Make **My Profile** (`/profile`) and **Reference Data** (`/reference-data`) modern, lab-oriented, and visually attractive, aligned with the existing redesigns (Settings, Dashboard, Statistics, Storage). Behavior and APIs stay unchanged.

## Aesthetic: "Modern precision lab"

Same scoped theme as Dashboard, Settings, and Storage: clean, precise, scientific, and cohesive with the rest of the app.

- **Background**: Off-white/slate gradient + 24×24px grid
- **Cards**: White surface, subtle border, teal-tinted hover
- **Accent**: Teal (e.g. `20 184 166`) for primary actions and active states
- **Typography**: DM Sans headings, Source Sans 3 body
- **Form controls**: Teal focus ring and primary buttons via descendant selectors

## Design choices

### Scoped styles only

- **Profile**: All styling under `.profile-page` in `packages/web/src/styles/profile.css`. Only the Profile route is affected.
- **Reference Data**: All styling under `.reference-data-page` in `packages/web/src/styles/reference-data.css`. Only the Reference Data route is affected.

Reuse the same CSS custom properties (e.g. `--dashboard-bg`, `--dashboard-accent`) and patterns from `settings.css` so the three pages (Settings, Profile, Reference Data) feel like one family.

### Profile page

- Wrap entire page in `<div className="profile-page">`.
- Cards use `.profile-card` for border, radius, shadow, and teal hover.
- Alerts use `.profile-alert-error` and `.profile-alert-success` for theme-appropriate red/green.
- Forms get teal focus and primary button styling via descendant selectors; no component changes.
- Optional staggered reveal (`.profile-reveal`) for hero and cards on load.

### Reference Data page

- Wrap entire page in `<div className="reference-data-page">`.
- Tab nav: active tab gets accent-muted background and accent border/color (same pattern as Settings nav).
- Main content card contains tab strip and table; table uses theme borders and header.
- View-only notice and Add New button use teal accent via descendant selectors.
- Edit/Add modal: `ReferenceDataForm` accepts optional `modalClassName`; Reference Data passes `modalClassName="reference-data-form-modal"`. `reference-data.css` styles `.reference-data-page .reference-data-form-modal` and form elements so the modal matches the page.

### Type safety

- In Profile (and anywhere touched), avoid `any` in catch blocks: use a small type guard or `unknown` and narrow for `err.response?.data?.error`.

## Why scoped styles

- **Predictability**: Only the affected route is styled.
- **Maintainability**: One CSS file and one wrapper class per page; future tweaks stay in one place.
- **Consistency**: Same pattern as dashboard, statistics, storage, and settings pages.
