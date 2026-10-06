## Agent skills

### Issue tracker

GitHub Issues on `eppicenter/sampledb3`. When a skill publishes or fetches an issue, see `docs/agents/issue-tracker.md`.

### Triage labels

When a skill applies or reads a triage role, see `docs/agents/triage-labels.md`.

### Domain docs

`CONTEXT.md` (glossary) and `docs/adr/` (decisions). When naming a domain concept or changing an area an ADR covers, see `docs/agents/domain.md`.

### Coding standards

When writing code, tests, issues, or proposals, or reviewing a change, follow `CODING_STANDARDS.md`.

### Package docs

- Writing an API test (test database, factories, authenticated routes): `packages/api/src/__tests__/README.md`
- Writing a web test (render helper, API mocks, React Query hooks): `packages/web/src/__tests__/README.md`
- Changing the schema, a migration, or a transaction: `packages/api/src/db/README.md`
- Finding the code behind a UI label: `packages/web/src/components/Sidebar.tsx` (label → path) → `packages/web/src/App.tsx` (path → page) → the page's hooks and `lib/` → `packages/api/src/routes` → `packages/api/src/lib`

### Tests

| Package | Command | Runner |
|---------|---------|--------|
| `@sampledb/web` | `cd packages/web && bun run test -- <files>` | **Vitest** (jsdom, `vi.mock`) |
| `@sampledb/api` | `cd packages/api && bun test src/...` | **Bun** (needs `bun:sqlite`) |

Run web tests with `bun run test`, never `bun test`: Bun's own runner hangs on React component tests. `vitest run` exits on its own, so piping it to `tail` or `grep` is safe.

### Pre-commit hooks and CI

The `Checks` workflow runs `bun run ci:verify` on every PR. Lint is clean, so any lint error is yours.

Install the repo hooks once per clone with `bun run setup:hooks`. The pre-commit hook only typechecks the packages your staged files touch and lints the staged API/web files; it runs no tests or build. Run `bun run ci:verify` before pushing to mirror CI.
