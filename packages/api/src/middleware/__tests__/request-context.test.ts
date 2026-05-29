import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import {
  REQUEST_ID_HEADER,
  requestContextMiddleware,
  resolveRequestId,
} from '../request-context'

describe('request-context middleware', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>
  const originalLogFormat = process.env.LOG_FORMAT

  beforeEach(() => {
    process.env.LOG_FORMAT = 'json'
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalLogFormat !== undefined) {
      process.env.LOG_FORMAT = originalLogFormat
    } else {
      delete process.env.LOG_FORMAT
    }
    consoleLog.mockRestore()
  })

  describe('resolveRequestId', () => {
    it('accepts valid client ids', () => {
      expect(resolveRequestId('req_client_abc123')).toBe('req_client_abc123')
    })

    it('generates when header missing', () => {
      expect(resolveRequestId(undefined)).toMatch(/^req_\d+_[a-z0-9]+$/)
    })

    it('generates when header invalid', () => {
      expect(resolveRequestId('bad id with spaces!')).toMatch(/^req_\d+_[a-z0-9]+$/)
    })
  })

  describe('requestContextMiddleware', () => {
    it('echoes generated request id on response', async () => {
      const app = new Hono()
      app.use('*', requestContextMiddleware())
      app.get('/health', (c) => c.json({ ok: true }))

      const res = await app.request('http://localhost/health')
      const requestId = res.headers.get(REQUEST_ID_HEADER)

      expect(requestId).toMatch(/^req_\d+_[a-z0-9]+$/)
      expect(consoleLog).toHaveBeenCalled()
      const payload = JSON.parse(String(consoleLog.mock.calls[0][0]))
      expect(payload.context?.requestId).toBe(requestId)
      expect(payload.context?.path).toBe('/health')
      expect(payload.context?.status).toBe(200)
    })

    it('accepts valid client request id', async () => {
      const app = new Hono()
      app.use('*', requestContextMiddleware())
      app.get('/health', (c) => c.json({ ok: true }))

      const clientId = 'req_client_trace_001'
      const res = await app.request('http://localhost/health', {
        headers: { [REQUEST_ID_HEADER]: clientId },
      })

      expect(res.headers.get(REQUEST_ID_HEADER)).toBe(clientId)
    })
  })
})
