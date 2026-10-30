## Agent skills

### Issue tracker

GitHub Issues on eppicenter/sampledb3 (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles mapped to GitHub labels; see `docs/agents/triage-labels.md`.

### Domain docs

`CONTEXT.md` (glossary) and `docs/adr/` (decisions) at repo root. See `docs/agents/domain.md`.

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
| repo root | `bun run test` | both, via package scripts |

**Run web tests with `bun run test` (Vitest).** It runs `vitest run`, which exits on its own, so piping to `tail` or `grep` is safe. Bun's own runner (`bun test`) hangs on React component tests.

Example (completes in ~1s):

```bash
cd packages/web && bun run test -- src/components/__tests__/BulkImportFlow.test.tsx
```

### Pre-commit hooks and CI

The `Checks` workflow runs `bun run ci:verify` on every PR: typecheck, lint, build, unit tests, and the docs stale-claims check. Lint is clean, so any lint error is yours.

Install repo hooks once per clone:

```bash
bun run setup:hooks
```

The pre-commit hook runs `typecheck` on `@sampledb/contract`, `@sampledb/api`, and/or `@sampledb/web` when staged files touch those packages (or Docker/build config), and lints the staged API/web source files. It refuses a source file with unstaged edits, since eslint would lint the working-tree copy. To mirror CI fully before pushing:

```bash
bun run ci:verify
```
