# E2E Tests (Playwright)

Run end-to-end tests against the app (API + web) with a real browser.

## First-time setup

Install Playwright browsers (required once per machine):

```bash
pnpm exec playwright install
```

## Run tests

From repo root (starts dev server automatically):

```bash
pnpm --filter e2e exec playwright test
```

From this directory:

```bash
pnpm exec playwright test
```

Tests include:

- `example.spec.ts`: app title, Studies route
- `critical-flows.spec.ts`: login page, home/dashboard or redirect
