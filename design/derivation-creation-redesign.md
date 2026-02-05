# Derivation Creation Flow Redesign

## Goal

Simplify derivation creation by aligning it with the bulk import pattern and reducing complexity in both the single-derivation modal and the bulk derivation import page. The core mental model is: **create a derivation record relating a new specimen to a parent (source) specimen.**

## Design decisions

### Align bulk derivation with bulk import

- **URL-step flow:** Bulk derivation import uses the same step pattern as specimen bulk import: `?step=upload` | `collections` | `import`. One primary action per step: **Validate & Continue** → (if needed) **Create collections & continue** → **Create derivations**.
- **Upload-first:** No separate "Step 1: Configure Settings" screen. The upload step has two dropdowns (Source, Parent container type), an optional collapsible "Apply to all rows (optional)" for derivation type, derived specimen type, derived container type, protocol, and date, plus file input and **Download template** link. Validation runs on **Validate & Continue**; dry run is implicit (validation does not write; **Create derivations** writes).
- **Collections step:** When validation reports collections that will be created, the user assigns a location to each and clicks **Create collections & continue**. Same behavior as [design/derivation-import-collections.md](derivation-import-collections.md).

### Simplify single-derivation modal

- **Existing collection only:** The modal no longer offers "Create new collection". The user searches for and selects an existing collection (plate, box, or sheet). If a new plate or box is needed, they create it first from Storage or use bulk derivation import.
- **Fewer fields:** Essential fields only: Source (read-only), Derivation type, Derived specimen type, Derived container type, Collection (search/select), Barcode/Position (or Label for paper), Derivation date, Protocol (optional), Notes (optional). Quantity, unit, quantity used, and "reduce parent quantity" were removed from the main form; the API uses defaults.
- **Lab-oriented wording:** Labels use **Source** and **Derived** consistently (e.g. "Source container", "Derived specimen type", "Derived container type").
- **Two buttons:** Cancel and **Create derivation**. Storage theme classes (`storage-btn-primary`, `storage-btn-secondary`) for consistency with the rest of the app.

### Wording and theme

- **Source / Derived** used consistently across bulk import page and modal.
- Bulk import page blurb: "Create derivation records that link parent specimens to new specimens. One row per derivation; upload a CSV or use the template."
- Derivations landing page: Added a bullet that users can create one derivation from a container's detail page.

## Files touched

| Area | File |
|------|------|
| Bulk derivation flow | `packages/web/src/pages/DerivationsBulkImport.tsx` |
| Single derivation modal | `packages/web/src/components/ContainerDerivationModal.tsx` |
| Container detail (source summary) | `packages/web/src/pages/ContainerDetail.tsx` |
| Derivations landing | `packages/web/src/pages/Derivations.tsx` |
| User guide | `packages/docs/src/content/docs/guides/features/derivations.md` |
| Design | `design/derivation-creation-redesign.md` (this file) |

## References

- [design/derivation-import-collections.md](derivation-import-collections.md) — Missing collections and create-collections step behavior.
- [design/containers-collections-redesign.md](containers-collections-redesign.md) — Storage theme and lab-oriented UI.
- [packages/web/src/components/BulkImportFlow.tsx](../packages/web/src/components/BulkImportFlow.tsx) — Upload → collections → import pattern.
