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

Persistence-shaped rows must not be spread directly into JSON responses. Route handlers map enrichment results to wire DTOs; successful JSON responses pass through global `omitOnWireMiddleware` (or explicit `wireJsonResponse`) so `null` and `undefined` keys are omitted.

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

- New API endpoints must not spread Drizzle rows into JSON; map to wire DTOs where shape matters, rely on omit-on-wire middleware for generic payloads.
- Web parsers import `@sampledb/contract/wire` for container responses; optional fields use `.optional()` in Zod, not `.nullish()`.
- Paper inbound writes use `sheetName` + `sublabel`; tube writes use `barcode`. Export columns split accordingly (`barcode`, `sublabel`, `sheet_name`).
- Stored export configurations with retired `label` column keys migrate to `sheet_name` on read.

## Related ADRs

- [ADR 0002: HTTP client response unwrap](./0002-http-client-response-unwrap.md) — client parse boundaries and shared contract usage
- [ADR 0003: SQLite schema evolution](./0003-sqlite-schema-evolution.md) — numbered migrations including 003

## Non-goals (this ADR)

- OpenAPI regen
- Down-migrations
- External backward compatibility for legacy wire nulls
