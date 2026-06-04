import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createSettingsRoutes } from '../settings'

describe('Settings API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        app.route('/api/settings', createSettingsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/settings', () => {
    it('returns 200 with omit-on-wire settings (null keys omitted)', async () => {
      const res = await ctx.request('/api/settings', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as Record<string, unknown>
      expect(data).toHaveProperty('password_requirements')
      expect(data).toHaveProperty('session_settings')
      expect(data).not.toHaveProperty('container_defaults')
      expect(JSON.stringify(data)).not.toMatch(/:\s*null/)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/settings', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

})
