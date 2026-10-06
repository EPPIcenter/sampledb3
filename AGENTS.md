## Agent skills

### Issue tracker

GitHub Issues on eppicenter/sampledb3 (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles mapped to GitHub labels; see `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` and `docs/adr/` at repo root when present. See `docs/agents/domain.md`.

### Package docs

- Writing an API test (test database, factories, authenticated routes): `packages/api/src/__tests__/README.md`
- Writing a web test (render helper, API mocks, React Query hooks): `packages/web/src/__tests__/README.md`
- Changing the schema, a migration, or a transaction: `packages/api/src/db/README.md`

### Tests

| Package | Command | Runner |
|---------|---------|--------|
| `@sampledb/web` | `cd packages/web && bun run test -- <files>` | **Vitest** (jsdom, `vi.mock`) |
| `@sampledb/api` | `cd packages/api && bun test src/...` | **Bun** (needs `bun:sqlite`) |
| repo root | `bun run test` | both, via package scripts |

**Web tests must use `bun run test` (Vitest), not `bun test`.** Bun's runner hangs on React component tests (no `vi.importActual`, no jsdom). Piping a hung process to `tail` blocks until EOF — avoid `| tail` on web tests unless you know the runner exits.

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

The pre-commit hook runs `typecheck` on `@sampledb/contract`, `@sampledb/api`, and/or `@sampledb/web` when staged files touch those packages (or Docker/build config), and lints the staged API/web source files. To mirror CI fully before pushing:

```bash
bun run ci:verify
```
