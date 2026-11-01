import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createErrorLogsRoutes } from '../error-logs'
import { ERROR_REPORT_LIMITS } from '@sampledb/contract'
import { errorLogs } from '../../db/schema'

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

    describe('size caps', () => {
      const post = (body: string, headers: Record<string, string> = {}) =>
        ctx.createRequestApp().request('/api/error-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body,
        })

      const countLogs = () => ctx.db.select().from(errorLogs).all().length

      it('accepts a report with every field at its cap', async () => {
        const contextPadding = 'c'.repeat(ERROR_REPORT_LIMITS.contextJson - JSON.stringify({ pad: '' }).length)
        const res = await post(JSON.stringify({
          message: 'm'.repeat(ERROR_REPORT_LIMITS.message),
          stack: 's'.repeat(ERROR_REPORT_LIMITS.stack),
          errorCode: 'e'.repeat(ERROR_REPORT_LIMITS.errorCode),
          context: { pad: contextPadding },
        }))
        expect(res.status).toBe(201)
        expect(countLogs()).toBe(1)
      })

      it.each([
        ['message', { message: 'm'.repeat(ERROR_REPORT_LIMITS.message + 1) }],
        ['stack', { message: 'x', stack: 's'.repeat(ERROR_REPORT_LIMITS.stack + 1) }],
        ['errorCode', { message: 'x', errorCode: 'e'.repeat(ERROR_REPORT_LIMITS.errorCode + 1) }],
        ['context', { message: 'x', context: { pad: 'c'.repeat(ERROR_REPORT_LIMITS.contextJson) } }],
      ])('rejects a report whose %s is over its cap with 400 and writes no frontend log', async (_field, report) => {
        const res = await post(JSON.stringify(report))
        expect(res.status).toBe(400)
        const body = (await res.json()) as { errorCode?: string }
        expect(body.errorCode).toBe('VALIDATION_ERROR')
        expect(ctx.db.select().from(errorLogs).all().filter((l) => l.source === 'frontend')).toHaveLength(0)
      })

      it('rejects a body over the byte cap with 413 and writes no log', async () => {
        const res = await post(JSON.stringify({ message: 'x', context: { pad: 'p'.repeat(ERROR_REPORT_LIMITS.bodyBytes) } }))
        expect(res.status).toBe(413)
        const body = (await res.json()) as { errorCode?: string }
        expect(body.errorCode).toBe('PAYLOAD_TOO_LARGE')
        expect(countLogs()).toBe(0)
      })

      it('rejects a streamed body over the byte cap (no Content-Length) with 413', async () => {
        const chunk = new TextEncoder().encode('x'.repeat(16 * 1024))
        let sent = 0
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent > ERROR_REPORT_LIMITS.bodyBytes) {
              controller.close()
              return
            }
            sent += chunk.length
            controller.enqueue(chunk)
          },
        })
        const res = await ctx.createRequestApp().request(new Request('http://localhost/api/error-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: stream,
          // @ts-expect-error - duplex is required by fetch for a streamed body but missing from the DOM types
          duplex: 'half',
        }))
        expect(res.status).toBe(413)
        expect(countLogs()).toBe(0)
      })
    })
  })
})
