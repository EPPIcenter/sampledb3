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
      additionalUsers: [
        { key: 'member', email: 'member@test.com', password: 'password123', role: 'member' },
        { key: 'viewer', email: 'viewer@test.com', password: 'password123', role: 'viewer' },
      ],
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

  describe('connected_apps setting', () => {
    it('defaults to off in GET /api/settings and GET /api/settings/connected_apps', async () => {
      const allRes = await ctx.request('/api/settings', { method: 'GET' })
      expect(allRes.status).toBe(200)
      const allData = (await allRes.json()) as { connected_apps?: { enabled: boolean } }
      expect(allData.connected_apps).toEqual({ enabled: false })

      const singleRes = await ctx.request('/api/settings/connected_apps', { method: 'GET' })
      expect(singleRes.status).toBe(200)
      expect(await singleRes.json()).toEqual({
        key: 'connected_apps',
        value: { enabled: false },
      })
    })

    it('allows an admin to enable and disable connected_apps', async () => {
      const enableRes = await ctx.request('/api/settings/connected_apps', {
        method: 'PUT',
        json: { enabled: true },
      })
      expect(enableRes.status).toBe(200)
      expect(await enableRes.json()).toEqual({
        key: 'connected_apps',
        value: { enabled: true },
      })

      const afterEnable = await ctx.request('/api/settings/connected_apps', { method: 'GET' })
      expect(await afterEnable.json()).toEqual({
        key: 'connected_apps',
        value: { enabled: true },
      })

      const disableRes = await ctx.request('/api/settings/connected_apps', {
        method: 'PUT',
        json: { enabled: false },
      })
      expect(disableRes.status).toBe(200)
      expect(await disableRes.json()).toEqual({
        key: 'connected_apps',
        value: { enabled: false },
      })
    })

    it('rejects non-admin updates (member and viewer) with 403', async () => {
      const memberRes = await ctx.request('/api/settings/connected_apps', {
        method: 'PUT',
        cookie: ctx.cookies.member,
        json: { enabled: true },
      })
      expect(memberRes.status).toBe(403)

      const viewerRes = await ctx.request('/api/settings/connected_apps', {
        method: 'PUT',
        cookie: ctx.cookies.viewer,
        json: { enabled: true },
      })
      expect(viewerRes.status).toBe(403)
    })

    it('rejects invalid connected_apps payload with 400', async () => {
      const res = await ctx.request('/api/settings/connected_apps', {
        method: 'PUT',
        json: { enabled: 'yes' },
      })
      expect(res.status).toBe(400)
    })
  })
})
