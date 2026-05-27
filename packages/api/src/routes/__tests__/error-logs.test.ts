import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createErrorLogsRoutes } from '../error-logs'

describe('Error Logs API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      additionalUsers: [
        {
          key: 'member',
          email: 'member@test.com',
          name: 'Member',
          password: 'password123',
          role: 'member',
        },
        {
          key: 'viewer',
          email: 'viewer@test.com',
          name: 'Viewer',
          password: 'password123',
          role: 'viewer',
        },
      ],
      mount: (app, { db }) => {
        app.route('/api/error-logs', createErrorLogsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/error-logs', () => {
    it('returns 200 with admin', async () => {
      const res = await ctx.request('/api/error-logs')
      expect(res.status).toBe(200)
      const data = (await res.json()) as { logs: unknown[]; pagination?: unknown }
      expect(data).toHaveProperty('logs')
      expect(Array.isArray(data.logs)).toBe(true)
    })

    it('returns 403 as member', async () => {
      const res = await ctx.request('/api/error-logs', { cookie: ctx.cookies.member })
      expect(res.status).toBe(403)
    })

    it('returns 403 as viewer', async () => {
      const res = await ctx.request('/api/error-logs', { cookie: ctx.cookies.viewer })
      expect(res.status).toBe(403)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/error-logs', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/error-logs', () => {
    it('accepts frontend error and inserts into database', async () => {
      const app = ctx.createRequestApp()
      const res = await app.request('/api/error-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Test frontend error',
          level: 'error',
          context: { page: 'TestPage' },
        }),
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { success?: boolean }
      expect(data.success).toBe(true)

      const listRes = await ctx.request('/api/error-logs')
      const listData = (await listRes.json()) as { logs: Array<{ message: string; source: string }> }
      expect(listData.logs.length).toBeGreaterThanOrEqual(1)
      const frontendLog = listData.logs.find((l) => l.source === 'frontend' && l.message.includes('Test frontend error'))
      expect(frontendLog).toBeDefined()
    })

    it('accepts error without authentication (optional auth)', async () => {
      const app = ctx.createRequestApp()
      const res = await app.request('/api/error-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Unauthenticated user error',
          level: 'error',
        }),
      })
      expect(res.status).toBe(201)
    })
  })
})
