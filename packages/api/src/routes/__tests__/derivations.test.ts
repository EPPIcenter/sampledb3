import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createDerivationsRoutes } from '../derivations'
import { eq } from 'drizzle-orm'
import { containerDerivation } from '../../db/schema'
import { createTestSpecimen, createTestSpecimenType, createTestStorageContainer } from '../../__tests__/helpers/factories'

const BASE = '/api/derivations'

describe('Derivations API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      additionalUsers: [{ key: 'member', email: 'member@test.com', password: 'password123', role: 'member' }],
      mount: (app, { db }) => {
        app.route('/api/derivations', createDerivationsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/containers/:id/derivations', () => {
    it('returns 200 and empty list for non-existent container', async () => {
      const res = await ctx.request(`${BASE}/containers/99999/derivations`, {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { derivations: unknown[]; count: number }
      expect(data).toHaveProperty('derivations')
      expect(data).toHaveProperty('count')
      expect(Array.isArray(data.derivations)).toBe(true)
      expect(data.count).toBe(0)
    })

    it('returns 400 for invalid container ID', async () => {
      const res = await ctx.request(`${BASE}/containers/notanid/derivations`, {
        method: 'GET',
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error: string }
      expect(data.error).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), `${BASE}/containers/1/derivations`, {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/containers/:id/derive', () => {
    it('returns 400 for invalid container ID', async () => {
      const res = await ctx.request(`${BASE}/containers/notanid/derive`, {
        method: 'POST',
        json: {
          derivationType: 'Test',
          specimenTypeName: 'Blood',
          containerType: 'micronix_tube',
        },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid payload (missing required fields)', async () => {
      const res = await ctx.request(`${BASE}/containers/1/derive`, {
        method: 'POST',
        json: {
          derivationType: 'Test',
          // missing specimenTypeName, containerType
        },
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string; details?: unknown }
      expect(data.error).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), `${BASE}/containers/1/derive`, {
        method: 'POST',
        json: {
          derivationType: 'Test',
          specimenTypeName: 'Blood',
          containerType: 'micronix_tube',
        },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/containers/:id/source', () => {
    it('returns 400 for invalid container ID', async () => {
      const res = await ctx.request(`${BASE}/containers/notanid/source`, {
        method: 'GET',
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), `${BASE}/containers/1/source`, {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })
  })
  describe('PATCH and DELETE /api/derivations/derivations/:id (admin-only)', () => {
    async function createDerivationRow() {
      const parent = await createTestStorageContainer(ctx.db)
      const specType = await createTestSpecimenType(ctx.db, { name: 'DNA' })
      const childSpecimen = await createTestSpecimen(ctx.db, specType.id)
      const child = await createTestStorageContainer(ctx.db, { unitId: parent!.unitId, specimenId: childSpecimen!.id })
      const [row] = await ctx.db
        .insert(containerDerivation)
        .values({ parentContainerId: parent!.id, childContainerId: child!.id, derivationType: 'extraction', protocol: 'P1' })
        .returning()
      return row!
    }

    async function loadDerivation(id: number) {
      return ctx.db.select().from(containerDerivation).where(eq(containerDerivation.id, id)).get()
    }

    it('returns 403 to a member editing a Derivation and leaves it unchanged', async () => {
      const d = await createDerivationRow()
      const res = await ctx.request(`${BASE}/derivations/${d.id}`, {
        method: 'PATCH',
        json: { protocol: 'P2' },
        cookie: ctx.cookies.member,
      })
      expect(res.status).toBe(403)
      expect((await loadDerivation(d.id))?.protocol).toBe('P1')
    })

    it('lets an admin edit a Derivation', async () => {
      const d = await createDerivationRow()
      const res = await ctx.request(`${BASE}/derivations/${d.id}`, { method: 'PATCH', json: { protocol: 'P2' } })
      expect(res.status).toBe(200)
      expect((await loadDerivation(d.id))?.protocol).toBe('P2')
    })

    it('returns 403 to a member deleting a Derivation and keeps it', async () => {
      const d = await createDerivationRow()
      const res = await ctx.request(`${BASE}/derivations/${d.id}`, { method: 'DELETE', cookie: ctx.cookies.member })
      expect(res.status).toBe(403)
      expect(await loadDerivation(d.id)).toBeDefined()
    })

    it('lets an admin delete a Derivation', async () => {
      const d = await createDerivationRow()
      const res = await ctx.request(`${BASE}/derivations/${d.id}`, { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(await loadDerivation(d.id)).toBeUndefined()
    })
  })
})
