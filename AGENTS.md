## Agent skills

- **Issue tracker**: GitHub Issues on `eppicenter/sampledb3`. "Publish to the issue tracker" is `gh issue create`; "fetch the relevant ticket" is `gh issue view <number> --comments`.
- **Triage labels**: each of the five triage roles is a GitHub label with the role's name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`.
- **Domain docs**: `CONTEXT.md` is the glossary, `docs/adr/` holds the decisions, and `packages/docs/` is the user guide.

## Checks

- Web tests: `cd packages/web && bun run test -- <files>`. Bun's own runner (`bun test`) hangs on React component tests; Vitest exits on its own, so piping it to `tail` or `grep` is safe.
- API tests: `cd packages/api && bun test src/...`.
- Lint is clean, so any lint error is yours.
- Run `bun run ci:verify` before pushing. The end of Build in `README.md` says what it and the pre-commit hook check.

## Where to look

- Writing code, tests, issues, or proposals, or reviewing a change: `CODING_STANDARDS.md`.
- Writing an API test: `packages/api/src/__tests__/README.md`.
- Writing a web test: `packages/web/src/__tests__/README.md`.
- Changing the schema or adding a migration: `packages/api/src/db/README.md`.
- Tracing a UI label to code: `packages/web/src/components/Sidebar.tsx` maps the label to a path and `packages/web/src/App.tsx` maps the path to a page. From there follow the page's hooks and `lib/api/<domain>` into `packages/api/src/routes` and `packages/api/src/lib`.
