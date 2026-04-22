# E2E tests (Playwright)

End-to-end tests run against the real API and Vite dev server. The harness uses a dedicated database file at the repo root: `sampledb_e2e.sqlite` (gitignored via `*.sqlite`).

## First-time setup

From the monorepo root (after `bun install`):

```bash
cd packages/e2e && bunx playwright install
```

To install only Chromium:

```bash
cd packages/e2e && bunx playwright install chromium
```

## Screenshots and report

Every test run captures a **viewport screenshot** after each test (`screenshot: 'on'`). They are attached to the **HTML report** and stored under `packages/e2e/test-results/` (gitignored).

After a run, open the report:

```bash
cd packages/e2e && bunx playwright show-report
```

To skip screenshots for a faster local run: `E2E_SCREENSHOTS=0 bun run test:e2e`.

## Run tests

From the repo root (starts API + web dev servers in parallel, then runs Playwright):

```bash
bun run test:e2e
```

From this package:

```bash
bun run test
```

### Optional: all desktop browsers (local)

CI runs Chromium only. Locally, to run Firefox and WebKit as well:

```bash
PLAYWRIGHT_BROWSERS=all bun run test:e2e
```

## Specs

- `tests/example.spec.ts` — app title, Studies route
- `tests/critical-flows.spec.ts` — login page, home/setup/dashboard
- `tests/public-routes.spec.ts` — register page, API metadata
- `tests/authenticated.spec.ts` — login as seeded admin, core pages (dashboard, studies, specimens, locations)

Global setup seeds an empty database via `POST /api/setup/initialize` using credentials in `helpers/e2e-seed.ts`. **CI** removes `sampledb_e2e.sqlite` before starting the server so the admin user always matches. Locally, if you already had a different database in that file, authenticated tests may fail until you stop any dev server using port 5173, delete `sampledb_e2e.sqlite` at the repo root, and run `bun run test:e2e` again. Alternatively run `E2E_FRESH_DB=1 bun run test:e2e` to remove that file automatically before boot (same as CI).

## CI

A scheduled and manually triggered workflow runs E2E in GitHub Actions (see `.github/workflows/e2e.yml`).
