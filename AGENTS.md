# Agent guide

## Agent skills

- **Issue tracker**: GitHub Issues on `eppicenter/sampledb3`. "Publish to the issue tracker" is `gh issue create`; "fetch the relevant ticket" is `gh issue view <number> --comments`.
- **Triage labels**: each of the five triage roles is a GitHub label with the role's name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`.
- **Domain docs**: `CONTEXT.md` is the glossary, `docs/adr/` holds the decisions, and `packages/docs/` is the user guide. Before you name or change a domain concept, read its `CONTEXT.md` entry and the ADRs that touch the area.

## Running tests and checks

- Web tests: `cd packages/web && bun run test -- <files>`. Bun's own runner (`bun test`) hangs on React component tests; Vitest exits on its own, so piping it to `tail` or `grep` is safe.
- API tests: `cd packages/api && NODE_ENV=test bun test src/...`. The package's `test` script sets `NODE_ENV=test`, and `src/db/legacy-baseline.ts` branches on it.
- Contract tests: `cd packages/contract && bun run test`. `bun run test` at the repo root runs the contract, API, and web suites.
- The `Checks` workflow lints every PR, so a lint error comes from your change.
- Run `bun run setup:hooks` once per clone to install the pre-commit hook, and `bun run ci:verify` before pushing. The end of Build in `README.md` says what each checks.

## Where to look

- Rules for naming domain concepts, contradicting an ADR, failing tests, database access, calling the API from the web, and writing API and web tests: `CODING_STANDARDS.md`. The `code-review` skill checks changes against it.
- Writing an API test: `packages/api/src/__tests__/README.md`.
- Writing a web test: `packages/web/src/__tests__/README.md`.
- Changing the schema or adding a migration: `packages/api/src/db/README.md`.
- Tracing a UI label to code: `packages/web/src/components/Sidebar.tsx` maps the label to a path and `packages/web/src/App.tsx` maps the path to a page. From there follow the page's hooks and `lib/api/<domain>` into `packages/api/src/routes` and `packages/api/src/lib`.
