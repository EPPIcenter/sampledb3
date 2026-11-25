import { createHash, randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { Client } from '@modelcontextprotocol/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import type { Database } from '../../db/client'
import { connectedApps, oauthClients, type User } from '../../db/schema'
import { setRequestDatabase } from '../../lib/db-context'
import { handleRouteError } from '../../lib/error-handler'
import { setConnectedAppsSettings } from '../../lib/settings'
import { omitOnWireMiddleware } from '../../middleware/omit-on-wire'
import { requestContextMiddleware } from '../../middleware/request-context'
import { createMcpRoutes, type CreateMcpRoutesOptions } from '../../routes/mcp'
import {
  createTestUser,
  setupPasswordRequirements,
  setupSessionSettings,
  type CreateTestUserOptions,
} from './auth-helpers'
import { cleanupTestDatabase, setupTestDatabase } from './db-setup'

export interface CreateTestConnectedAppOptions {
  userId: number
  clientId?: string
  clientName?: string
  redirectUris?: string[]
  accessToken?: string
  expiresAt?: number
  refreshToken?: string | null
  previousRefreshToken?: string | null
  refreshTokenExpiresAt?: number | null
  scope?: string | null
  revokedAt?: string | null
  lastUsedAt?: string | null
}

export interface TestConnectedApp {
  connectionId: string
  clientId: string
  clientName: string
  accessToken: string
  refreshToken: string | null
  expiresAt: number
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Create an OAuth client (if not already present) and a Connected app row directly in the DB
 * for testing MCP tool calls and auth edge cases. Tokens are stored only as SHA-256 hashes.
 */
export async function createTestConnectedApp(
  db: Database,
  options: CreateTestConnectedAppOptions,
): Promise<TestConnectedApp> {
  const clientId = options.clientId ?? `client_${nanoid(12)}`
  const clientName = options.clientName ?? 'Test MCP Client'
  const redirectUris = options.redirectUris ?? ['http://127.0.0.1:43210/callback']

  await db
    .insert(oauthClients)
    .values({
      id: clientId,
      name: clientName,
      redirectUris,
    })
    .onConflictDoNothing()

  const connectionId = `conn_${nanoid(12)}`
  const accessToken = options.accessToken ?? randomBytes(32).toString('base64url')
  const expiresAt = options.expiresAt ?? Math.floor(Date.now() / 1000) + 3600
  const refreshToken = options.refreshToken ?? null

  await db.insert(connectedApps).values({
    id: connectionId,
    userId: options.userId,
    clientId,
    accessTokenHash: sha256Hex(accessToken),
    accessTokenExpiresAt: expiresAt,
    refreshTokenHash: refreshToken ? sha256Hex(refreshToken) : null,
    previousRefreshTokenHash: options.previousRefreshToken
      ? sha256Hex(options.previousRefreshToken)
      : null,
    refreshTokenExpiresAt: options.refreshTokenExpiresAt ?? null,
    scope: options.scope ?? 'mcp',
    lastUsedAt: options.lastUsedAt ?? null,
    revokedAt: options.revokedAt ?? null,
  })

  return {
    connectionId,
    clientId,
    clientName,
    accessToken,
    refreshToken,
    expiresAt,
  }
}

export interface CreateMcpSdkClientOptions {
  baseUrl?: string
  path?: string
  headers?: Record<string, string>
  clientName?: string
  clientVersion?: string
}

/**
 * Create and connect an official MCP SDK Client bound to an in-process Hono app via custom fetch.
 */
export async function createMcpSdkClient(
  app: Hono,
  accessToken: string,
  options: CreateMcpSdkClientOptions = {},
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const baseUrl = options.baseUrl ?? 'http://localhost'
  const path = options.path ?? '/api/mcp'
  const url = new URL(path, baseUrl)

  const boundFetch: typeof fetch = (input, init) => {
    const req =
      input instanceof Request
        ? new Request(input, init)
        : new Request(typeof input === 'string' ? input : input.toString(), init)
    return Promise.resolve(app.fetch(req))
  }

  const transport = new StreamableHTTPClientTransport(url, {
    fetch: boundFetch,
    requestInit: {
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const client = new Client({
    name: options.clientName ?? 'sampledb-test-client',
    version: options.clientVersion ?? '1.0.0',
  })

  await client.connect(transport)
  return { client, transport }
}

export interface SetupMcpTestOptions {
  user?: Partial<CreateTestUserOptions>
  enabled?: boolean
  mcpOptions?: CreateMcpRoutesOptions
  mount?: (app: Hono, ctx: { db: Database; sqlite: SQLiteDatabase }) => void
  seed?: (ctx: { db: Database; sqlite: SQLiteDatabase; user: User }) => Promise<void>
}

export interface McpTestContext {
  db: Database
  sqlite: SQLiteDatabase
  app: Hono
  user: User
  connection: TestConnectedApp
  client: Client
  transport: StreamableHTTPClientTransport
  connectAs: (
    userId: number,
    options?: Partial<Omit<CreateTestConnectedAppOptions, 'userId'>> & CreateMcpSdkClientOptions,
  ) => Promise<{
    connection: TestConnectedApp
    client: Client
    transport: StreamableHTTPClientTransport
  }>
  cleanup: () => Promise<void>
}

/**
 * Set up an in-memory DB, enable Connected apps (by default), create a user and connection,
 * mount `/api/mcp` on an in-process Hono app, and return a connected MCP SDK Client.
 */
export async function setupMcpTest(options: SetupMcpTestOptions = {}): Promise<McpTestContext> {
  const { db, sqlite } = await setupTestDatabase()
  await setupPasswordRequirements(db, 8)
  await setupSessionSettings(db, 604800)

  if (options.enabled !== false) {
    await setConnectedAppsSettings(db, { enabled: true })
  }

  const user = await createTestUser(db, {
    email: options.user?.email ?? 'mcp-member@test.com',
    name: options.user?.name ?? 'MCP Member',
    username: options.user?.username,
    password: options.user?.password ?? 'password123',
    role: options.user?.role ?? 'member',
    approvedAt: options.user?.approvedAt,
  })

  await options.seed?.({ db, sqlite, user })

  const app = new Hono()
  app.use('*', async (c, next) => {
    setRequestDatabase(c, db)
    await next()
  })
  app.use('*', requestContextMiddleware())
  app.use('*', omitOnWireMiddleware)
  app.onError((err, c) => handleRouteError(err, c))
  app.route('/api/mcp', createMcpRoutes(db, options.mcpOptions))
  options.mount?.(app, { db, sqlite })

  const connection = await createTestConnectedApp(db, { userId: user.id })
  const openClients: Array<{ client: Client; transport: StreamableHTTPClientTransport }> = []

  let client!: Client
  let transport!: StreamableHTTPClientTransport

  if (options.enabled !== false) {
    const connected = await createMcpSdkClient(app, connection.accessToken)
    client = connected.client
    transport = connected.transport
    openClients.push(connected)
  }

  const connectAs: McpTestContext['connectAs'] = async (userId, connectOpts = {}) => {
    const conn = await createTestConnectedApp(db, {
      userId,
      clientId: connectOpts.clientId,
      clientName: connectOpts.clientName,
      redirectUris: connectOpts.redirectUris,
      accessToken: connectOpts.accessToken,
      expiresAt: connectOpts.expiresAt,
      refreshToken: connectOpts.refreshToken,
      previousRefreshToken: connectOpts.previousRefreshToken,
      refreshTokenExpiresAt: connectOpts.refreshTokenExpiresAt,
      scope: connectOpts.scope,
      revokedAt: connectOpts.revokedAt,
      lastUsedAt: connectOpts.lastUsedAt,
    })
    const sdk = await createMcpSdkClient(app, conn.accessToken, connectOpts)
    openClients.push(sdk)
    return { connection: conn, ...sdk }
  }

  const cleanup = async () => {
    for (const entry of openClients) {
      await entry.client.close().catch(() => {})
    }
    cleanupTestDatabase(sqlite)
  }

  return {
    db,
    sqlite,
    app,
    user,
    connection,
    client,
    transport,
    connectAs,
    cleanup,
  }
}
