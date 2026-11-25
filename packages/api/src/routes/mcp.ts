import { Hono } from 'hono'
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import type { Database } from '../db/client'
import { getAppBuildId } from '../lib/app-build-id'
import { ExpectedNotFoundError, RouteError, UnauthorizedError, handleRouteError } from '../lib/error-handler'
import {
  authenticateMcpToken,
  extractBearerToken,
  touchConnectedAppLastUsed,
} from '../lib/mcp/auth'
import { MCP_SERVER_INSTRUCTIONS } from '../lib/mcp/instructions'
import { getAllowedOrigins, isOriginAllowed } from '../lib/mcp/origin'
import { getDefaultMcpTools, registerMcpToolsForConnection } from '../lib/mcp/tools'
import type { McpConnectionContext, McpToolDefinition } from '../lib/mcp/types'
import { isConnectedAppsEnabled } from '../lib/settings'
import { rateLimit } from '../middleware/rate-limit'

const API_VERSION = '1.1.0'
const DEFAULT_MCP_RATE_LIMIT = { maxRequests: 120, windowMs: 60 * 1000 }

export interface CreateMcpRoutesOptions {
  /** Override the full tool list (defaults to getDefaultMcpTools()). */
  tools?: readonly McpToolDefinition[]
  /** Extra tools appended to the default list (useful for tests). */
  extraTools?: readonly McpToolDefinition[]
  /** Allowed Origin header values when a client sends Origin. Defaults to getAllowedOrigins(). */
  allowedOrigins?: readonly string[] | (() => readonly string[])
  /** Dedicated rate limit for the MCP endpoint (defaults to 120 req/min, matching search). */
  rateLimit?: { maxRequests: number; windowMs: number }
  /** Injectable clock for deterministic expiry and last-used throttling tests. */
  now?: () => Date
  /** Display name of this SampleDB instance (defaults to INSTANCE_NAME env or 'SampleDB'). */
  instanceName?: string
}

function resolveInstanceName(explicit?: string): string {
  const candidate = explicit ?? process.env.INSTANCE_NAME
  const trimmed = candidate?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'SampleDB'
}

export function createMcpRoutes(database: Database, options: CreateMcpRoutesOptions = {}) {
  const mcp = new Hono()
  const limitConfig = options.rateLimit ?? DEFAULT_MCP_RATE_LIMIT
  const getNow = options.now ?? (() => new Date())
  const resolveAllowedOrigins =
    typeof options.allowedOrigins === 'function'
      ? options.allowedOrigins
      : options.allowedOrigins
        ? () => options.allowedOrigins as readonly string[]
        : getAllowedOrigins

  const registeredTools: readonly McpToolDefinition[] = [
    ...(options.tools ?? getDefaultMcpTools()),
    ...(options.extraTools ?? []),
  ]

  mcp.use('*', rateLimit(limitConfig.maxRequests, limitConfig.windowMs))

  mcp.all('/', async (c) => {
    try {
      // 1. Feature gate: while Connected apps is off, the endpoint answers as not found.
      if (!(await isConnectedAppsEnabled(database))) {
        throw new ExpectedNotFoundError('Not found')
      }

      // 2. Origin check (DNS rebinding protection): validate when sent; grant no CORS headers.
      const origin = c.req.header('origin')
      if (origin !== undefined && !isOriginAllowed(origin, resolveAllowedOrigins())) {
        throw new RouteError(403, {
          error: 'Origin not allowed',
          errorCode: 'FORBIDDEN',
        })
      }

      // 3. Reject OPTIONS preflights with no CORS access granted.
      if (c.req.method === 'OPTIONS') {
        c.header('Allow', 'POST')
        throw new RouteError(405, {
          error: 'Method not allowed',
          errorCode: 'METHOD_NOT_ALLOWED',
        })
      }

      // 4. Authenticate Connected app bearer access token (accepted on /api/mcp only).
      const token = extractBearerToken(c.req.header('authorization'))
      if (!token) {
        c.header('WWW-Authenticate', 'Bearer')
        throw new UnauthorizedError('Missing or invalid bearer token')
      }

      const now = getNow()
      const auth = await authenticateMcpToken(database, token, now)
      if (!auth) {
        c.header('WWW-Authenticate', 'Bearer')
        throw new UnauthorizedError('Invalid or expired access token')
      }

      // 5. Record connection public id for structured request logging and throttle last_used_at.
      c.set('connectedAppId', auth.connection.id)
      await touchConnectedAppLastUsed(database, auth.connection.id, auth.connection.lastUsedAt, now)

      // 6. Stateless JSON-response Streamable HTTP: only POST is supported (no SSE stream on GET).
      if (c.req.method !== 'POST') {
        c.header('Allow', 'POST')
        throw new RouteError(405, {
          error: 'Method not allowed',
          errorCode: 'METHOD_NOT_ALLOWED',
        })
      }

      const instance = {
        name: resolveInstanceName(options.instanceName),
        version: API_VERSION,
        buildId: getAppBuildId(),
      }

      const connectionContext: McpConnectionContext = {
        db: database,
        connection: {
          id: auth.connection.id,
          clientId: auth.connection.clientId,
          clientName: auth.connection.clientName,
        },
        user: auth.user,
        effectiveRole: auth.effectiveRole,
        canWrite: auth.canWrite,
        instance,
      }

      const server = new McpServer(
        { name: instance.name, version: instance.version },
        { instructions: MCP_SERVER_INSTRUCTIONS },
      )
      registerMcpToolsForConnection(server, registeredTools, connectionContext)

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })

      await server.connect(transport)
      try {
        return await transport.handleRequest(c.req.raw)
      } finally {
        await server.close().catch(() => {})
      }
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  return mcp
}
