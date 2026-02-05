# Study Bulk Import Rationale

## Goal

Provide a bulk import flow **from the study interface** so users can add subjects and specimens to the current study without including a study short code in the CSV. The study is taken from context (the study detail page), reducing columns and avoiding mistakes when all rows belong to one study.

## Decisions

- **Reuse existing APIs**: No new backend endpoints. The same `POST /subjects/bulk`, `POST /specimens/bulk`, and `POST /subjects/with-specimens` endpoints are used. The study-scoped UI injects the current study's short code into every row when building the request.

- **Entry point**: "Bulk import" in the study detail header under "More actions" (with "Edit study" and "Merge subjects"). Visible when the user has write permission. Clicking navigates to `/studies/:id/import`.

- **Dedicated route**: `/studies/:id/import` is a full-page flow (not a modal) so the same multi-step experience (upload → collections if needed → import) fits naturally and matches the general Import page.

- **Shared flow component**: The general Import page and the study import page share a single component, `BulkImportFlow`, which accepts an optional `fixedStudyShortCode`. When set, required CSV columns omit `study_short_code`, templates omit it, and the short code is injected into every payload. This keeps behavior and validation in one place and avoids duplicating the large import logic.

- **Context and navigation**: The study import page shows a breadcrumb (Studies → [Study title] → Bulk import), a subtitle indicating the study (title and short code), and helper text that the CSV does not need a study column. After a successful import, a "Back to study" link and "Start New Import" are shown.

## Files

| Area | File |
|------|------|
| Shared flow | `packages/web/src/components/BulkImportFlow.tsx` |
| General import | `packages/web/src/pages/Import.tsx` |
| Study import | `packages/web/src/pages/StudyImport.tsx` |
| Route | `packages/web/src/App.tsx` |
| Header action | `packages/web/src/components/StudyDetailHeader.tsx`, `packages/web/src/pages/StudyDetail.tsx` |
| Docs | `packages/docs/src/content/docs/guides/bulk-operations/import.md` |
| Design | `design/study-bulk-import-rationale.md` (this file) |
