# MCP endpoint and Connected apps: built-in OAuth, member-capped connections, transfer links, and shared template mapping

---
status: accepted
---

Lab staff who use Claude Code or other MCP clients could not reach SampleDB from them because the API accepts only browser session cookies. Most lab staff are not developers: asking them to install Node or Bun, maintain a local MCP server package, or copy API tokens into environment variables blocks adoption and creates stale local tooling.

SampleDB instead serves an **MCP endpoint** directly from the API and lets users approve **Connected apps** through their browser (see [CONTEXT.md](../../CONTEXT.md) and issue #140).

## Decisions

These five decisions are costly to reverse and govern the feature across all tickets:

1. **The instance is its own OAuth 2.1 authorization server.** SampleDB implements OAuth 2.1 with authorization code + PKCE (`S256` required), refresh token rotation with reuse detection, Dynamic Client Registration limited to public clients with loopback redirect URIs, and the standard protected resource and authorization server metadata documents. Authorization codes and access/refresh tokens are random values of at least 256 bits stored only as SHA-256 hashes, matching session cookies. No raw credential is ever shown to a user.
2. **A Connected app acts as Viewer or Member and never as Admin.** There is one OAuth scope; the effective role is read from the user's current database record on every request and capped at **Member**. An admin's connection cannot manage users, change admin settings, edit **Reference data**, or perform **Destructive actions**. Every MCP tool declares whether it reads or writes, and writing tools are listed and runnable only when the effective role is **Member**.
3. **Access tokens work only on the MCP endpoint.** Bearer tokens issued for a **Connected app** are validated exclusively by the `/api/mcp` route. The existing cookie-based auth middleware for the rest of the API is unchanged and ignores `Authorization: Bearer` headers. The entire feature is gated by an admin-controlled `connected_apps` instance setting that defaults to off; while off, the MCP endpoint and related OAuth and transfer endpoints answer as 404.
4. **Bulk data moves by Transfer link.** Large files—**Container export** downloads, **Specimen export** / **Inventory export** files, **Export filter files**, and bulk import CSVs—never pass through tool payloads or the AI model context. Tools return short-lived, single-file **Transfer links** backed by a staging directory on disk beside the database file, with token path segments redacted from request logs.
5. **The import file is the bulk import template CSV, mapped by one shared module.** MCP import tools accept only the existing bulk import template CSV format and validate/register through the same contract mapper (`@sampledb/contract`) and domain registration pipeline (**Specimen registration**, [ADR 0010](./0010-specimen-registration.md)) that the web import page uses. Off-template reshaping happens on the user's machine with explicit confirmation; the server reports structured validation problems and never silently alters data.

## Considered options

- **Local stdio MCP server with personal API tokens**: rejected. Requires Node or Bun on lab laptops, version upkeep across clients, and manual handling of long-lived credentials.
- **Accepting Bearer tokens across all `/api/*` routes**: rejected. Broadens the blast radius of a leaked token and couples MCP authorization to browser session routes.
- **External identity provider (OIDC / third-party OAuth)**: rejected. SampleDB is self-hosted on lab networks with local accounts; requiring an external IdP adds deployment friction most labs cannot adopt.
- **Accepting arbitrary JSON or non-template spreadsheets on import tools**: rejected. Duplicates validation logic and diverges from the web import workflow, removing the web page as a fallback.

## Consequences

- **Schema**: Migration 013 adds `oauth_clients`, `oauth_authorization_codes`, and `connected_apps` (tokens and codes stored as SHA-256 hashes). A later migration adds the transfer link table when transfer links land.
- **Transport**: `/api/mcp` serves stateless Streamable HTTP with JSON responses (`WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined` and `enableJsonResponse: true`) using `@modelcontextprotocol/server`, checks `Origin` against allowed origins when sent, grants no CORS headers, and has its own rate limit.
- **Domain alignment**: No existing ADR is contradicted. Imports go through [ADR 0006](./0006-unified-container-inbound-write.md) and [ADR 0010](./0010-specimen-registration.md); exports use [ADR 0009](./0009-container-read-view.md) and [ADR 0011](./0011-container-selection.md); errors and request logging follow [ADR 0004](./0004-structured-logging-and-error-persistence.md).
- **Observability**: Structured request logs record `connectedAppId` (the connection's public id) on MCP requests, and `last_used_at` is updated at most once per minute per connection.
