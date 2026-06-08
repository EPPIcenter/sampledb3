# Wire DTO layer and omit-on-wire JSON

---
status: accepted
---

SampleDB API responses use a **wire DTO** layer between persistence (Drizzle/SQLite, where `NULL` is normal) and clients (where optional fields should be absent, not JSON `null`).

## Three layers

| Layer | Optional field representation |
|-------|------------------------------|
| **Storage** (SQLite / Drizzle) | SQL `NULL` → TypeScript `\| null` |
| **Wire** (HTTP JSON) | Key **omitted** when unset |
| **Client** (web parse / UI) | TypeScript optional / `undefined` |

Persistence-shaped rows must not be spread directly into JSON responses. Route handlers return wire-shaped payloads via `c.json(...)`; **global `omitOnWireMiddleware`** applies the null-omission policy to every successful JSON response.

### Two responsibilities (do not conflate)

| Layer | Responsibility | Where |
|-------|----------------|--------|
| **Null omission** | Remove keys whose values are `null` or `undefined` | Global `omitOnWireMiddleware` → `toWireJson()` |
| **Semantic mapping** | Discriminated unions, field renaming (`sublabel` vs `barcode`), placement shape | Route-level wire mappers + Zod schemas in `@sampledb/contract/wire` |

Middleware is **permanent infrastructure** for null omission — not a substitute for mappers. Routes where wire shape matters (containers today) must map to explicit wire DTOs **before** `c.json`; middleware only strips remaining nulls.

## Shared contract

`@sampledb/contract/wire` exports:

- `toWireJson()` — response-boundary serializer
- Zod wire schemas (e.g. discriminated `EnrichedContainerWire`)
- Parse helpers used by API conformance tests and the web client

## Container wire shape

`EnrichedContainerWire` is a **discriminated union** on `containerType`:

- **Placement** lives on `collection` (type, id, name; optional `position` for grid-based types only).
- **Identity** lives on the variant root: `barcode` (micronix/cryovial), `sublabel` (paper).
- Sheet placement has **no** `position` — grid coordinates do not apply to paper on a sheet.

## Migration 003

`paper.barcode` was renamed to `paper.sublabel`; unused `paper.position` was dropped after a fail-hard preflight guard. Spot identifiers are never bulk-nulled.

## Consequences

- New API endpoints must not spread Drizzle rows into JSON; map to wire DTOs where shape matters. Generic CRUD may rely on middleware for null omission only.
- Do not call `toWireJson()` in route handlers — middleware owns null omission. Route-level mappers focus on semantic shape.
- Integration tests mount `omitOnWireMiddleware` via the shared route test harness so wire shape matches production.
- Expand `@sampledb/contract/wire` schemas incrementally where discriminated shape matters; do not wire-schema every CRUD route.
- Web parsers import `@sampledb/contract/wire` for container responses; optional fields use `.optional()` in Zod, not `.nullish()`.
- Inbound container writes use the unified `ContainerWriteInput` shape ([ADR 0006](./0006-unified-container-inbound-write.md)) — same placement/identity split as outbound wire, not flat legacy fields.
- Export columns split accordingly (`barcode`, `sublabel`, `sheet_name`). Stored export configurations migrate retired keys on read (`label` → `sheet_name`; append `sublabel` when `barcode` or `sheet_name` is present).

## Related ADRs

- [ADR 0006: Unified container inbound write shape](./0006-unified-container-inbound-write.md) — inbound mirror of this outbound wire model
- [ADR 0002: HTTP client response unwrap](./0002-http-client-response-unwrap.md) — client parse boundaries and shared contract usage
- [ADR 0003: SQLite schema evolution](./0003-sqlite-schema-evolution.md) — numbered migrations including 003

## Non-goals (this ADR)

- OpenAPI regen
- Down-migrations
- External backward compatibility for legacy wire nulls
