## Agent skills

### Issue tracker

GitHub Issues on eppicenter/sampledb3 (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles mapped to GitHub labels; see `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` and `docs/adr/` at repo root when present. See `docs/agents/domain.md`.

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
