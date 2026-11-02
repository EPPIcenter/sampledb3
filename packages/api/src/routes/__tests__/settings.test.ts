import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createTestContainerTypeUnit, createTestUnit } from '../../__tests__/helpers/factories'
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
      additionalUsers: [{ key: 'viewer', email: 'viewer@test.com', password: 'password123', role: 'viewer' }],
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

  describe('GET /api/settings/container-types/:containerType/units', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/settings/container-types/paper/units', {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })

    it("returns the container type's units to a viewer", async () => {
      const microliter = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await createTestContainerTypeUnit(ctx.db, { containerType: 'cryovial_tube', unitId: microliter.id })

      const res = await ctx.request('/api/settings/container-types/cryovial_tube/units', {
        method: 'GET',
        cookie: ctx.cookies.viewer,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        units: [{ id: microliter.id, symbol: 'uL', name: 'microliter', category: 'volume' }],
      })
    })
  })

  describe('PUT /api/settings/:key', () => {
    for (const userId of ['abc', -1, 1.5]) {
      it(`rejects userId ${JSON.stringify(userId)} with 400`, async () => {
        const res = await ctx.request('/api/settings/session_settings', {
          method: 'PUT',
          json: { userId, timeoutMinutes: 60 },
        })
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toMatch(/userId must be a positive integer or null/)
      })
    }
  })
})
