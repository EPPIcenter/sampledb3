import { describe, it, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { users, connectedApps } from '../../db/schema'
import { MCP_SERVER_INSTRUCTIONS } from '../../lib/mcp/instructions'
import { isMcpEndpointPath } from '../../lib/mcp/origin'
import { defineMcpTool } from '../../lib/mcp/types'
import { setConnectedAppsSettings } from '../../lib/settings'
import { clearRateLimitStoreForTesting, rateLimit } from '../../middleware/rate-limit'
import { createSettingsRoutes } from '../../routes/settings'
import { createTestUser } from '../helpers/auth-helpers'
import {
  createTestConnectedApp,
  setupMcpTest,
  type McpTestContext,
} from '../helpers/mcp-test-client'

const MCP_INIT_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  },
})

function mcpPostHeaders(token?: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

describe('MCP endpoint', () => {
  let ctx: McpTestContext | null = null

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup()
      ctx = null
    }
  })

  describe('Connected apps feature gate', () => {
    it('returns 404 on /api/mcp when Connected apps is off (default)', async () => {
      ctx = await setupMcpTest({ enabled: false })

      const unauthRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(),
        body: MCP_INIT_BODY,
      })
      expect(unauthRes.status).toBe(404)

      const authRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(ctx.connection.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(authRes.status).toBe(404)
    })

    it('stops serving /api/mcp immediately when Connected apps is turned off', async () => {
      ctx = await setupMcpTest()
      const first = await ctx.client.callTool({ name: 'whoami', arguments: {} })
      expect(first.isError).not.toBe(true)

      await setConnectedAppsSettings(ctx.db, { enabled: false })

      const res = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(ctx.connection.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(res.status).toBe(404)
    })
  })

  describe('access token authentication and isolation', () => {
    it('returns 401 when no token or malformed bearer header is sent', async () => {
      ctx = await setupMcpTest()

      const missingRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(),
        body: MCP_INIT_BODY,
      })
      expect(missingRes.status).toBe(401)
      expect(missingRes.headers.get('www-authenticate')).toContain('Bearer')

      const malformedRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: {
          ...mcpPostHeaders(),
          Authorization: 'Basic dXNlcjpwYXNz',
        },
        body: MCP_INIT_BODY,
      })
      expect(malformedRes.status).toBe(401)
    })

    it('returns 401 for an unknown, expired, or revoked token', async () => {
      ctx = await setupMcpTest()

      const unknownRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders('totally-unknown-token'),
        body: MCP_INIT_BODY,
      })
      expect(unknownRes.status).toBe(401)

      const expired = await createTestConnectedApp(ctx.db, {
        userId: ctx.user.id,
        expiresAt: Math.floor(Date.now() / 1000) - 10,
      })
      const expiredRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(expired.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(expiredRes.status).toBe(401)

      const revoked = await createTestConnectedApp(ctx.db, {
        userId: ctx.user.id,
        revokedAt: '2026-01-01 00:00:00',
      })
      const revokedRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(revoked.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(revokedRes.status).toBe(401)

      // Also verify live revocation of an existing connection
      await ctx.db
        .update(connectedApps)
        .set({ revokedAt: '2026-01-01 00:00:00' })
        .where(eq(connectedApps.id, ctx.connection.connectionId))
      const afterRevoke = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(ctx.connection.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(afterRevoke.status).toBe(401)
    })

    it('returns 401 for a soft-deleted or unapproved user', async () => {
      ctx = await setupMcpTest()

      const unapprovedUser = await createTestUser(ctx.db, {
        email: 'pending@test.com',
        name: 'Pending User',
        password: 'password123',
        role: 'member',
        approvedAt: null,
      })
      const pendingConn = await createTestConnectedApp(ctx.db, { userId: unapprovedUser.id })
      const pendingRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(pendingConn.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(pendingRes.status).toBe(401)

      await ctx.db
        .update(users)
        .set({ deletedAt: '2026-01-01 00:00:00' })
        .where(eq(users.id, ctx.user.id))
      const deletedRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(ctx.connection.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(deletedRes.status).toBe(401)
    })

    it('ignores MCP bearer tokens on other API routes (rest of auth middleware unchanged)', async () => {
      ctx = await setupMcpTest({
        mount: (app, { db }) => {
          app.route('/api/settings', createSettingsRoutes(db))
        },
      })

      const res = await ctx.app.request('/api/settings', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ctx.connection.accessToken}`,
        },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('whoami tool and role capping', () => {
    it('returns user, role in effect, instance info, and importsAvailable for a member', async () => {
      ctx = await setupMcpTest({
        user: { email: 'alice@lab.org', name: 'Alice', username: 'alice', role: 'member' },
        mcpOptions: { instanceName: 'EPPIcenter SampleDB' },
      })

      const result = await ctx.client.callTool({ name: 'whoami', arguments: {} })
      expect(result.isError).not.toBe(true)

      const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === 'text',
      )
      expect(textBlock?.text).toBeDefined()
      const payload = JSON.parse(textBlock!.text!)
      expect(payload).toMatchObject({
        user: {
          id: ctx.user.id,
          name: 'Alice',
          email: 'alice@lab.org',
          username: 'alice',
        },
        role: 'member',
        instance: {
          name: 'EPPIcenter SampleDB',
          version: '1.1.0',
          buildId: expect.any(String),
        },
        importsAvailable: true,
      })
    })

    it('caps an admin user connection at member', async () => {
      ctx = await setupMcpTest({
        user: { email: 'admin@lab.org', name: 'Admin User', role: 'admin' },
      })

      const result = await ctx.client.callTool({ name: 'whoami', arguments: {} })
      const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === 'text',
      )
      const payload = JSON.parse(textBlock!.text!)
      expect(payload.role).toBe('member')
      expect(payload.importsAvailable).toBe(true)
    })

    it('reports viewer role and importsAvailable false with explanation for a viewer', async () => {
      ctx = await setupMcpTest({
        user: { email: 'viewer@lab.org', name: 'Viewer User', role: 'viewer' },
      })

      const result = await ctx.client.callTool({ name: 'whoami', arguments: {} })
      const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === 'text',
      )
      const payload = JSON.parse(textBlock!.text!)
      expect(payload.role).toBe('viewer')
      expect(payload.importsAvailable).toBe(false)
      expect(typeof payload.importsUnavailableReason).toBe('string')
      expect(payload.importsUnavailableReason.length).toBeGreaterThan(0)
    })

    it('reflects a user role change on the very next whoami call', async () => {
      ctx = await setupMcpTest({
        user: { email: 'staff@lab.org', name: 'Lab Staff', role: 'member' },
      })

      const before = await ctx.client.callTool({ name: 'whoami', arguments: {} })
      const beforePayload = JSON.parse(
        ((before.content as Array<{ type: string; text?: string }>)[0]?.text) ?? '{}',
      )
      expect(beforePayload.role).toBe('member')
      expect(beforePayload.importsAvailable).toBe(true)

      // Demote user to viewer in DB
      await ctx.db.update(users).set({ role: 'viewer' }).where(eq(users.id, ctx.user.id))

      const after = await ctx.client.callTool({ name: 'whoami', arguments: {} })
      const afterPayload = JSON.parse(
        ((after.content as Array<{ type: string; text?: string }>)[0]?.text) ?? '{}',
      )
      expect(afterPayload.role).toBe('viewer')
      expect(afterPayload.importsAvailable).toBe(false)
    })
  })

  describe('tool access control (read vs write)', () => {
    it('lists and runs a writing tool for member and admin, and hides and blocks it for viewer', async () => {
      const writeSpy = vi.fn()
      const testWriteTool = defineMcpTool({
        name: 'test_record_note',
        description: 'Test writing tool for verifying read/write enforcement.',
        access: 'write',
        inputSchema: z.object({ note: z.string() }),
        handler: ({ note }, toolCtx) => {
          writeSpy({ note, effectiveRole: toolCtx.effectiveRole, userId: toolCtx.user.id })
          return {
            content: [{ type: 'text', text: `recorded:${note}:${toolCtx.effectiveRole}` }],
          }
        },
      })

      ctx = await setupMcpTest({
        user: { email: 'member@lab.org', name: 'Member', role: 'member' },
        mcpOptions: { extraTools: [testWriteTool] },
      })

      const adminUser = await createTestUser(ctx.db, {
        email: 'admin@lab.org',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      })
      const viewerUser = await createTestUser(ctx.db, {
        email: 'viewer@lab.org',
        name: 'Viewer',
        password: 'password123',
        role: 'viewer',
      })

      const adminConn = await ctx.connectAs(adminUser.id)
      const viewerConn = await ctx.connectAs(viewerUser.id)

      // Member: sees both whoami (readOnlyHint) and test_record_note, and can run it
      const memberTools = await ctx.client.listTools()
      expect(memberTools.tools.map((t) => t.name)).toContain('whoami')
      expect(memberTools.tools.map((t) => t.name)).toContain('test_record_note')
      const whoamiDef = memberTools.tools.find((t) => t.name === 'whoami')
      expect(whoamiDef?.annotations?.readOnlyHint).toBe(true)

      const memberCall = await ctx.client.callTool({
        name: 'test_record_note',
        arguments: { note: 'from-member' },
      })
      expect(memberCall.isError).not.toBe(true)
      expect((memberCall.content as Array<{ text?: string }>)[0]?.text).toBe('recorded:from-member:member')

      // Admin: sees and runs writing tool, with role capped at member
      const adminTools = await adminConn.client.listTools()
      expect(adminTools.tools.map((t) => t.name)).toContain('test_record_note')
      const adminCall = await adminConn.client.callTool({
        name: 'test_record_note',
        arguments: { note: 'from-admin' },
      })
      expect(adminCall.isError).not.toBe(true)
      expect((adminCall.content as Array<{ text?: string }>)[0]?.text).toBe('recorded:from-admin:member')

      // Viewer: writing tool is NOT listed and calling it fails without invoking handler
      const viewerTools = await viewerConn.client.listTools()
      expect(viewerTools.tools.map((t) => t.name)).toEqual(['whoami'])

      const callsBeforeViewer = writeSpy.mock.calls.length
      let viewerCallFailed = false
      try {
        const viewerCall = await viewerConn.client.callTool({
          name: 'test_record_note',
          arguments: { note: 'should-not-run' },
        })
        viewerCallFailed = viewerCall.isError === true
      } catch {
        viewerCallFailed = true
      }
      expect(viewerCallFailed).toBe(true)
      expect(writeSpy).toHaveBeenCalledTimes(callsBeforeViewer)
    })
  })

  describe('Streamable HTTP transport, Origin validation, CORS, and rate limiting', () => {
    it('serves stateless JSON responses with instructions under 4,096 chars and rejects GET/DELETE with 405', async () => {
      expect(MCP_SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(4096)

      ctx = await setupMcpTest()
      expect(ctx.client.getInstructions()).toBe(MCP_SERVER_INSTRUCTIONS)

      const initRes = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(ctx.connection.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(initRes.status).toBe(200)
      expect(initRes.headers.get('content-type')).toContain('application/json')
      expect(initRes.headers.get('mcp-session-id')).toBeNull()

      const getRes = await ctx.app.request('/api/mcp', {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${ctx.connection.accessToken}`,
        },
      })
      expect(getRes.status).toBe(405)
      expect(getRes.headers.get('allow')).toBe('POST')

      const deleteRes = await ctx.app.request('/api/mcp', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ctx.connection.accessToken}`,
        },
      })
      expect(deleteRes.status).toBe(405)
      expect(deleteRes.headers.get('allow')).toBe('POST')
    })

    it('checks Origin when sent and grants browsers no CORS access', async () => {
      ctx = await setupMcpTest({
        mcpOptions: {
          allowedOrigins: ['https://sampledb.lab.org'],
        },
      })

      // Wrap in an outer app using the same CORS exclusion rule as index.ts
      const outer = new Hono()
      const apiCors = cors({
        origin: ['https://sampledb.lab.org'],
        credentials: true,
      })
      outer.use('*', async (c, next) => {
        if (isMcpEndpointPath(new URL(c.req.url).pathname)) {
          return next()
        }
        return apiCors(c, next)
      })
      outer.get('/api/ping', (c) => c.json({ ok: true }))
      outer.all('/api/mcp', (c) => ctx!.app.fetch(c.req.raw))

      // Sanity check: regular API route still receives CORS for allowed origin
      const regularRes = await outer.request('/api/ping', {
        method: 'GET',
        headers: { Origin: 'https://sampledb.lab.org' },
      })
      expect(regularRes.headers.get('access-control-allow-origin')).toBe('https://sampledb.lab.org')

      // MCP without Origin -> 200, no CORS headers
      const noOriginRes = await outer.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(ctx.connection.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(noOriginRes.status).toBe(200)
      expect(noOriginRes.headers.get('access-control-allow-origin')).toBeNull()

      // MCP with allowed Origin -> 200, still NO CORS headers
      const allowedOriginRes = await outer.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(ctx.connection.accessToken, {
          Origin: 'https://sampledb.lab.org',
        }),
        body: MCP_INIT_BODY,
      })
      expect(allowedOriginRes.status).toBe(200)
      expect(allowedOriginRes.headers.get('access-control-allow-origin')).toBeNull()
      expect(allowedOriginRes.headers.get('access-control-allow-credentials')).toBeNull()

      // MCP with disallowed Origin -> 403, no CORS headers
      const badOriginRes = await outer.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(ctx.connection.accessToken, {
          Origin: 'https://evil.example.com',
        }),
        body: MCP_INIT_BODY,
      })
      expect(badOriginRes.status).toBe(403)
      expect(badOriginRes.headers.get('access-control-allow-origin')).toBeNull()

      // Browser CORS preflight OPTIONS -> rejected with no CORS grant
      const preflightRes = await outer.request('/api/mcp', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://sampledb.lab.org',
          'Access-Control-Request-Method': 'POST',
        },
      })
      expect(preflightRes.status).toBe(405)
      expect(preflightRes.headers.get('access-control-allow-origin')).toBeNull()
      expect(preflightRes.headers.get('access-control-allow-methods')).toBeNull()
    })

    it('enforces its own rate limit independently of other routes', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      const originalTrustProxy = process.env.TRUST_PROXY
      process.env.NODE_ENV = 'development'
      process.env.TRUST_PROXY = 'true'
      clearRateLimitStoreForTesting()

      try {
        ctx = await setupMcpTest({
          enabled: false,
          mcpOptions: {
            rateLimit: { maxRequests: 2, windowMs: 60_000 },
          },
          mount: (app) => {
            const other = new Hono()
            other.use('*', rateLimit(2, 60_000))
            other.get('/', (c) => c.json({ ok: true }))
            app.route('/api/other', other)
          },
        })
        await setConnectedAppsSettings(ctx.db, { enabled: true })

        const headers = mcpPostHeaders(ctx.connection.accessToken, {
          'x-forwarded-for': '203.0.113.42',
        })
        expect((await ctx.app.request('/api/mcp', { method: 'POST', headers, body: MCP_INIT_BODY })).status).toBe(200)
        expect((await ctx.app.request('/api/mcp', { method: 'POST', headers, body: MCP_INIT_BODY })).status).toBe(200)

        const third = await ctx.app.request('/api/mcp', { method: 'POST', headers, body: MCP_INIT_BODY })
        expect(third.status).toBe(429)

        // Separate limiter: /api/other is unaffected by /api/mcp's bucket
        const otherRes = await ctx.app.request('/api/other', {
          method: 'GET',
          headers: { 'x-forwarded-for': '203.0.113.42' },
        })
        expect(otherRes.status).toBe(200)
      } finally {
        process.env.NODE_ENV = originalNodeEnv
        if (originalTrustProxy !== undefined) {
          process.env.TRUST_PROXY = originalTrustProxy
        } else {
          delete process.env.TRUST_PROXY
        }
        clearRateLimitStoreForTesting()
      }
    })
  })

  describe('structured request logging and last_used_at throttling', () => {
    it('records the connection public id in the structured request log on MCP requests', async () => {
      const originalLogFormat = process.env.LOG_FORMAT
      process.env.LOG_FORMAT = 'json'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      try {
        ctx = await setupMcpTest({
          mount: (app) => {
            app.get('/api/ping', (c) => c.json({ ok: true }))
          },
        })
        logSpy.mockClear()

        await ctx.client.callTool({ name: 'whoami', arguments: {} })

        const mcpLogEntry = logSpy.mock.calls
          .map((args) => {
            try {
              return JSON.parse(String(args[0])) as { context?: Record<string, unknown> }
            } catch {
              return null
            }
          })
          .find((entry) => entry?.context?.type === 'request' && entry.context.path === '/api/mcp')

        expect(mcpLogEntry).toBeDefined()
        expect(mcpLogEntry?.context?.connectedAppId).toBe(ctx.connection.connectionId)

        // Regular route has no connectedAppId in request log
        logSpy.mockClear()
        await ctx.app.request('/api/ping', { method: 'GET' })
        const pingLogEntry = logSpy.mock.calls
          .map((args) => {
            try {
              return JSON.parse(String(args[0])) as { context?: Record<string, unknown> }
            } catch {
              return null
            }
          })
          .find((entry) => entry?.context?.type === 'request' && entry.context.path === '/api/ping')
        expect(pingLogEntry).toBeDefined()
        expect(pingLogEntry?.context?.connectedAppId).toBeUndefined()
      } finally {
        logSpy.mockRestore()
        if (originalLogFormat !== undefined) {
          process.env.LOG_FORMAT = originalLogFormat
        } else {
          delete process.env.LOG_FORMAT
        }
      }
    })

    it('writes last_used_at at most once per minute per connection', async () => {
      let currentTime = new Date('2026-11-25T10:00:00.000Z')
      ctx = await setupMcpTest({
        enabled: false,
        mcpOptions: { now: () => currentTime },
      })
      await setConnectedAppsSettings(ctx.db, { enabled: true })

      const freshConn = await createTestConnectedApp(ctx.db, {
        userId: ctx.user.id,
        expiresAt: Math.floor(currentTime.getTime() / 1000) + 3600,
      })

      const readLastUsed = async () => {
        const row = await ctx!.db
          .select({ lastUsedAt: connectedApps.lastUsedAt })
          .from(connectedApps)
          .where(eq(connectedApps.id, freshConn.connectionId))
          .get()
        return row?.lastUsedAt ?? null
      }

      expect(await readLastUsed()).toBeNull()

      // First request at 10:00:00 -> writes last_used_at
      const first = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(freshConn.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(first.status).toBe(200)
      expect(await readLastUsed()).toBe('2026-11-25 10:00:00')

      // Second request 30 seconds later -> throttled (no update)
      currentTime = new Date('2026-11-25T10:00:30.000Z')
      const second = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(freshConn.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(second.status).toBe(200)
      expect(await readLastUsed()).toBe('2026-11-25 10:00:00')

      // Third request 61 seconds after initial write -> updates last_used_at
      currentTime = new Date('2026-11-25T10:01:01.000Z')
      const third = await ctx.app.request('/api/mcp', {
        method: 'POST',
        headers: mcpPostHeaders(freshConn.accessToken),
        body: MCP_INIT_BODY,
      })
      expect(third.status).toBe(200)
      expect(await readLastUsed()).toBe('2026-11-25 10:01:01')
    })
  })
})
