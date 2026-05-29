# Structured logging and error persistence

---
status: accepted
---

SampleDB runs on Fly with stdout captured for ops and an Admin **Error Logs** UI backed by the `error_logs` table. These are **two intentional sinks**: **observability** (machine-readable request and diagnostic lines on stdout) and **error persistence** (selected failures for biobank operators to review). They share correlation via `requestId` but serve different audiences.

**Observability module.** Rename `packages/api/src/lib/logger.ts` to `observability.ts`. All structured stdout goes through this module (`logDebug`, `logInfo`, `logWarn`, `logError`, request access lines, performance timers). Replace Hono’s plain-text `logger()` middleware with observability-based request logging in the same pass as request-ID middleware (one middleware swap, not two). Human-readable bootstrap and migration output (emoji startup banners, schema-evolution CLI prose) stays plain `console.log` — not structured JSON.

**Stdout format.** The adapter always builds the same log entry object. Emission uses `LOG_FORMAT=pretty|json` when set; otherwise **pretty** when `NODE_ENV !== 'production'` and stdout is a TTY, else **single-line JSON** (Fly production default).

**Request correlation.** Accept a client `X-Request-Id` when it passes validation; otherwise generate with `generateRequestId()` (`req_{timestamp}_{random}`). Echo the chosen ID on every response. Store on Hono context; pass into `ErrorLogContext.requestId` and observability request lines. Web client: attach the interceptor to **`axiosApi`** (`packages/web/src/lib/api/client.ts`); switch the frontend error logger from raw `axios` to `axiosApi` in PR1 so error POSTs share the same ID. Failed API responses: read echoed `X-Request-Id` into error-logger context.

**Route error policy.** Consolidate ~13 route modules that bypass `handleRouteError` using a **hybrid** pattern: throw typed errors for expected HTTP outcomes; `catch` + `return handleRouteError(error, c)` where needed; use `RouteError` when the client-visible JSON body must stay stable (e.g. export `"Failed to export …"` messages). Remove all route-level `console.error` catch blocks.

**404 logging taxonomy.** Two classes at the same HTTP seam: `ExpectedNotFoundError` — 404 response, **no** `error_logs` row (export preflight misses, user-supplied lookup failures). `NotFoundError` — 404 response, persist at **warning** (stale links, missing resources on direct GET). Genuine 500s and invariant breaks stay at **error**. Production Fly sets `ERROR_LOG_LEVEL=error`, so warnings (including unexpected 404s and Zod validation) do not appear in Admin Error Logs unless the threshold is lowered.

## Considered options

- **Delete `logger.ts` and adopt pino** — rejected for now; unused module already defines the JSON shape; adding a dependency is a separate trade-off.
- **Wire logger.ts without rename** — rejected; `logError` name collision with `error-logger.ts` invites wrong imports as call sites grow.
- **Server-only request IDs** — rejected; browser/API correlation for lab-staff failures requires client header + response echo.
- **Catch-and-delegate only (no typed throws)** — rejected; duplicate Zod/404 handling stays shallow; export body preservation needs `RouteError`.
- **Global axios interceptors** — rejected; monkey-patches all axios usage including tests.
- **Interceptor on `axiosApi` only; error-logger uses raw axios** — rejected; error POSTs would miss correlation.

## Consequences

- **PR1:** `observability.ts`, format rules, request middleware (access log + requestId + header echo), wire `requestId` into `error-handler`, replace `console.error` fallbacks in error-handler with observability, web axios interceptor (send/read `X-Request-Id`, attach to frontend error-logger context).
- **PR2:** Route consolidation file-by-file (`export.ts` first); introduce `ExpectedNotFoundError`; adjust `NotFoundError` branch to log at warning.
- Maintainers: import observability for stdout, `error-logger` for DB persistence — never the other way around.
- Tests: observability adapter (pretty vs JSON, request line shape); `ERROR_LOG_LEVEL` filtering; end-to-end throw → `error_logs` row with `requestId`.
