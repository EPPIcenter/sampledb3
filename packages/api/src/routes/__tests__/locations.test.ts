import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createLocationsRoutes } from '../locations'
import {
  createTestBag,
  createTestBox,
  createTestCryovialBox,
  createTestLocation,
  createTestMicronixPlate,
  createTestStorageType,
} from '../../__tests__/helpers/factories'
import { location, users } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Locations API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'user@test.com',
        name: 'User',
        password: 'password123',
        role: 'member',
      },
      additionalUsers: [
        { key: 'admin', email: 'admin@test.com', name: 'Admin', password: 'password123', role: 'admin' },
        { key: 'viewer', email: 'viewer@test.com', name: 'Viewer', password: 'password123', role: 'viewer' },
      ],
      settings: { pagination: true },
      mount: (app, { db, sqlite }) => {
        app.route('/api/locations', createLocationsRoutes(db, sqlite))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  function loadLocation(id: number) {
    return ctx.db.select().from(location).where(eq(location.id, id)).get()
  }

  describe('GET /api/locations', () => {
    it('returns 200 and locations array with pagination', async () => {
      const res = await ctx.request('/api/locations', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { locations: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('locations')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.locations)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/locations', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/locations oversized page (#120)', () => {
    it('returns 400 for an oversized page on the list', async () => {
      const res = await ctx.request('/api/locations?page=99999999999999999999')
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toContain('page')
    })

    it.each(['plates_page', 'cryovial_boxes_page', 'boxes_page', 'bags_page'])(
      'returns 400 for an oversized %s on a Location',
      async (param) => {
        const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
        const loc = await createTestLocation(ctx.db, {
          name: 'Root',
          storageTypeId: String(storageType.id),
          canContainCollections: true,
          path: 'Root',
        })
        const res = await ctx.request(`/api/locations/${loc.id}?${param}=99999999999999999999`)
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toContain(param)
      },
    )
  })

  describe('GET /api/locations/:id', () => {
    it('returns 200 and location when found', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const loc = await createTestLocation(ctx.db, {
        name: 'Root',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: false,
        path: 'Root',
      })
      const res = await ctx.request(`/api/locations/${loc.id}`, {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { location: { id: number; name: string } }
      expect(data.location).toBeDefined()
      expect(data.location.id).toBe(loc.id)
      expect(data.location.name).toBe('Root')
    })

    it('returns 404 when location does not exist', async () => {
      const res = await ctx.request('/api/locations/99999', {
        method: 'GET',
      })
      expect(res.status).toBe(404)
    })

    it('returns 400 for an ID that is not a number', async () => {
      const res = await ctx.request('/api/locations/abc')

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Invalid location ID', errorCode: 'VALIDATION_ERROR' })
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/locations/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('storage type on root and child locations', () => {
    it('creates a root location when parentId is omitted', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const res = await ctx.request('/api/locations', {
        method: 'POST',
        cookie: ctx.cookies.admin,
        json: { name: 'Root A', storageTypeId: String(storageType.id), canContainCollections: false },
      })
      expect(res.status).toBe(201)
    })

    it('moves a root location under a parent without sending storageTypeId', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const parent = await createTestLocation(ctx.db, { name: 'Parent', storageTypeId: String(storageType.id) })
      const root = await createTestLocation(ctx.db, { name: 'Other Root', storageTypeId: String(storageType.id) })

      const res = await ctx.request(`/api/locations/${root.id}`, {
        method: 'PUT',
        cookie: ctx.cookies.admin,
        json: { parentId: parent.id },
      })

      expect(res.status).toBe(200)
      const [row] = await ctx.db.select().from(location).where(eq(location.id, root.id))
      expect(row.parentId).toBe(parent.id)
      expect(row.storageTypeId).toBeNull()
    })
  })
  describe('PUT /api/locations/:id canContainCollections', () => {
    async function collectionLocation() {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      return createTestLocation(ctx.db, { name: 'Shelf', storageTypeId: String(storageType.id), canContainCollections: true })
    }

    it('returns 409 naming how many Collections the Location holds, and changes nothing', async () => {
      const shelf = await collectionLocation()
      await createTestMicronixPlate(ctx.db, { name: 'P1', locationId: shelf.id })
      await createTestMicronixPlate(ctx.db, { name: 'P2', locationId: shelf.id })
      await createTestCryovialBox(ctx.db, { name: 'C1', locationId: shelf.id })
      await createTestBox(ctx.db, { name: 'B1', locationId: shelf.id })
      await createTestBag(ctx.db, { name: 'G1', locationId: shelf.id })

      const res = await ctx.request(`/api/locations/${shelf.id}`, {
        method: 'PUT',
        cookie: ctx.cookies.admin,
        json: { canContainCollections: false, description: 'changed' },
      })

      expect(res.status).toBe(409)
      const body = (await res.json()) as { error: string; errorCode: string }
      expect(body.errorCode).toBe('CONFLICT')
      expect(body.error).toBe(
        'Cannot turn off "can contain collections": this location holds 5 collections. Move them to another location first.',
      )
      const row = await loadLocation(shelf.id)
      expect(row?.canContainCollections).toBe(true)
      expect(row?.description).toBe(shelf.description)
    })

    it('says "1 collection" when the Location holds one', async () => {
      const shelf = await collectionLocation()
      await createTestBag(ctx.db, { name: 'G1', locationId: shelf.id })

      const res = await ctx.request(`/api/locations/${shelf.id}`, {
        method: 'PUT',
        cookie: ctx.cookies.admin,
        json: { canContainCollections: false },
      })

      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toContain('holds 1 collection.')
    })

    it('turns off canContainCollections on a Location that holds no Collections', async () => {
      const shelf = await collectionLocation()
      const other = await createTestLocation(ctx.db, { name: 'Other', storageTypeId: shelf.storageTypeId, canContainCollections: true })
      await createTestMicronixPlate(ctx.db, { name: 'P1', locationId: other.id })

      const res = await ctx.request(`/api/locations/${shelf.id}`, {
        method: 'PUT',
        cookie: ctx.cookies.admin,
        json: { canContainCollections: false },
      })

      expect(res.status).toBe(200)
      expect((await loadLocation(shelf.id))?.canContainCollections).toBe(false)
    })

    it('accepts canContainCollections: true on a Location that holds Collections', async () => {
      const shelf = await collectionLocation()
      await createTestMicronixPlate(ctx.db, { name: 'P1', locationId: shelf.id })

      const res = await ctx.request(`/api/locations/${shelf.id}`, {
        method: 'PUT',
        cookie: ctx.cookies.admin,
        json: { canContainCollections: true, description: 'changed' },
      })

      expect(res.status).toBe(200)
      expect((await loadLocation(shelf.id))?.description).toBe('changed')
    })
  })

  describe('PUT /api/locations/:id refusals', () => {
    async function freezerWithShelf() {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const freezer = await createTestLocation(ctx.db, { name: 'Freezer 1', storageTypeId: String(storageType.id) })
      const shelf = await createTestLocation(ctx.db, { name: 'Shelf 1', parentId: freezer.id })
      return { storageType, freezer, shelf }
    }

    function loadLocation(id: number) {
      return ctx.db.select().from(location).where(eq(location.id, id)).get()
    }

    function put(id: number | string, json: Record<string, unknown>) {
      return ctx.request(`/api/locations/${id}`, { method: 'PUT', cookie: ctx.cookies.admin, json })
    }

    it('returns 400 for an ID that is not a number', async () => {
      const res = await put('abc', { name: 'Renamed' })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Invalid location ID', errorCode: 'VALIDATION_ERROR' })
    })

    it('returns 404 when the Location does not exist', async () => {
      const res = await put(99999, { name: 'Renamed' })

      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: 'Location not found', errorCode: 'NOT_FOUND' })
    })

    it('refuses a parent that does not exist', async () => {
      const { shelf } = await freezerWithShelf()

      const res = await put(shelf.id, { parentId: 99999 })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Parent location not found', errorCode: 'VALIDATION_ERROR' })
      expect(await loadLocation(shelf.id)).toEqual(shelf)
    })

    it('refuses to make a Location its own parent', async () => {
      const { shelf } = await freezerWithShelf()

      const res = await put(shelf.id, { parentId: shelf.id })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        error: 'Location cannot be its own parent',
        errorCode: 'VALIDATION_ERROR',
      })
      expect(await loadLocation(shelf.id)).toEqual(shelf)
    })

    it('refuses to move a Location under one of its own descendants', async () => {
      const { freezer, shelf } = await freezerWithShelf()

      const res = await put(freezer.id, { parentId: shelf.id })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        error: 'Cannot set parent: would create a circular reference (parent is a descendant)',
        errorCode: 'VALIDATION_ERROR',
      })
      expect(await loadLocation(freezer.id)).toEqual(freezer)
    })

    it('refuses to clear the storage type of a root Location', async () => {
      const { freezer } = await freezerWithShelf()

      const res = await put(freezer.id, { storageTypeId: null })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        error: 'Storage type ID is required for root locations',
        errorCode: 'VALIDATION_ERROR',
      })
      expect(await loadLocation(freezer.id)).toEqual(freezer)
    })

    it('refuses to give a child Location a storage type', async () => {
      const { storageType, shelf } = await freezerWithShelf()

      const res = await put(shelf.id, { storageTypeId: String(storageType.id) })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        error: 'Storage type ID must be null for child locations',
        errorCode: 'VALIDATION_ERROR',
      })
      expect(await loadLocation(shelf.id)).toEqual(shelf)
    })

    it('refuses a name already used under the same parent', async () => {
      const { freezer, shelf } = await freezerWithShelf()
      const other = await createTestLocation(ctx.db, { name: 'Shelf 2', parentId: freezer.id })

      const res = await put(other.id, { name: shelf.name })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        error: 'Location with this name already exists under the same parent',
        errorCode: 'VALIDATION_ERROR',
      })
      expect(await loadLocation(other.id)).toEqual(other)
    })
  })

  describe('what each role may write (#141)', () => {
    type ErrorBody = { error: string; errorCode?: string }

    async function freezer(name = 'Freezer 1') {
      const storageType = await createTestStorageType(ctx.db, { name: `${name} type` })
      return createTestLocation(ctx.db, { name, storageTypeId: String(storageType.id), canContainCollections: true })
    }

    function locationsNamed(name: string) {
      return ctx.db.select().from(location).where(eq(location.name, name))
    }

    /** The session cookie for a role; the default session is the member's. */
    function cookieFor(role: 'member' | 'admin' | 'viewer') {
      return role === 'member' ? ctx.cookie : ctx.cookies[role]
    }

    describe('POST /api/locations', () => {
      it('lets a member create a child Location and records them as its creator', async () => {
        const parent = await freezer()
        const member = await ctx.db.select().from(users).where(eq(users.email, 'user@test.com')).get()

        const res = await ctx.request('/api/locations', {
          method: 'POST',
          json: { parentId: parent.id, name: 'Shelf 1', canContainCollections: true },
        })

        expect(res.status).toBe(201)
        const body = (await res.json()) as { location: { id: number; path: string } }
        expect(body.location.path).toBe('Freezer 1 → Shelf 1')
        const row = await loadLocation(body.location.id)
        expect(row).toMatchObject({
          parentId: parent.id,
          name: 'Shelf 1',
          storageTypeId: null,
          canContainCollections: true,
          createdBy: member!.id,
          updatedBy: member!.id,
        })
      })

      it('lets a member create a root Location with its storage type', async () => {
        const storageType = await createTestStorageType(ctx.db, { name: 'Room' })

        const res = await ctx.request('/api/locations', {
          method: 'POST',
          json: { name: 'Room 325', storageTypeId: String(storageType.id) },
        })

        expect(res.status).toBe(201)
        const body = (await res.json()) as { location: { id: number } }
        expect(await loadLocation(body.location.id)).toMatchObject({
          parentId: null,
          name: 'Room 325',
          storageTypeId: String(storageType.id),
          canContainCollections: false,
        })
      })

      it('refuses a member a root Location without a storage type', async () => {
        const res = await ctx.request('/api/locations', { method: 'POST', json: { name: 'Room 325' } })

        expect(res.status).toBe(400)
        expect(await locationsNamed('Room 325')).toHaveLength(0)
      })

      it('refuses a member a name already used under the same parent', async () => {
        const parent = await freezer()
        await createTestLocation(ctx.db, { name: 'Shelf 1', parentId: parent.id })

        const res = await ctx.request('/api/locations', {
          method: 'POST',
          json: { parentId: parent.id, name: 'Shelf 1' },
        })

        expect(res.status).toBe(400)
        expect(((await res.json()) as ErrorBody).error).toBe(
          'Location with this name already exists under the same parent',
        )
        expect(await locationsNamed('Shelf 1')).toHaveLength(1)
      })

      it('refuses a member a parent that does not exist', async () => {
        const res = await ctx.request('/api/locations', {
          method: 'POST',
          json: { parentId: 99999, name: 'Shelf 1' },
        })

        expect(res.status).toBe(400)
        expect(await locationsNamed('Shelf 1')).toHaveLength(0)
      })

      it('returns 403 to a viewer and creates nothing', async () => {
        const parent = await freezer()

        const res = await ctx.request('/api/locations', {
          method: 'POST',
          cookie: ctx.cookies.viewer,
          json: { parentId: parent.id, name: 'Shelf 1' },
        })

        expect(res.status).toBe(403)
        expect(await locationsNamed('Shelf 1')).toHaveLength(0)
      })

      it('returns 401 when not authenticated', async () => {
        const res = await ctx.request('/api/locations', {
          method: 'POST',
          cookie: null,
          json: { name: 'Shelf 1' },
        })

        expect(res.status).toBe(401)
      })
    })

    describe('PUT /api/locations/:id', () => {
      it.each([
        ['rename', { name: 'Renamed' }],
        ['description', { description: 'changed' }],
        ['canContainCollections', { canContainCollections: false }],
      ])('returns 403 to a member changing %s, and changes nothing', async (_field, json) => {
        const loc = await freezer()

        const res = await ctx.request(`/api/locations/${loc.id}`, { method: 'PUT', json })

        expect(res.status).toBe(403)
        expect(await loadLocation(loc.id)).toEqual(loc)
      })

      it('returns 403 to a member moving a Location', async () => {
        const parent = await freezer()
        const other = await freezer('Freezer 2')

        const res = await ctx.request(`/api/locations/${other.id}`, {
          method: 'PUT',
          json: { parentId: parent.id },
        })

        expect(res.status).toBe(403)
        expect(await loadLocation(other.id)).toEqual(other)
      })

      it('returns 403 to a viewer', async () => {
        const loc = await freezer()

        const res = await ctx.request(`/api/locations/${loc.id}`, {
          method: 'PUT',
          cookie: ctx.cookies.viewer,
          json: { name: 'Renamed' },
        })

        expect(res.status).toBe(403)
        expect(await loadLocation(loc.id)).toEqual(loc)
      })
    })

    describe('DELETE /api/locations/:id', () => {
      it.each(['member', 'admin'] as const)('lets a %s delete an empty Location', async (role) => {
        const parent = await freezer()
        const shelf = await createTestLocation(ctx.db, { name: 'Shelf 1', parentId: parent.id })

        const res = await ctx.request(`/api/locations/${shelf.id}`, { method: 'DELETE', cookie: cookieFor(role) })

        expect(res.status).toBe(200)
        expect(await loadLocation(shelf.id)).toBeUndefined()
        expect(await loadLocation(parent.id)).toBeDefined()
      })

      it('lets a member delete an empty Location that someone else created', async () => {
        const parent = await freezer()
        const admin = await ctx.db.select().from(users).where(eq(users.email, 'admin@test.com')).get()
        const shelf = await createTestLocation(ctx.db, { name: 'Shelf 1', parentId: parent.id, createdBy: admin!.id })

        const res = await ctx.request(`/api/locations/${shelf.id}`, { method: 'DELETE' })

        expect(res.status).toBe(200)
        expect(await loadLocation(shelf.id)).toBeUndefined()
      })

      it.each(['member', 'admin'] as const)(
        'refuses a %s a Location that has a child Location',
        async (role) => {
          const parent = await freezer()
          const shelf = await createTestLocation(ctx.db, { name: 'Shelf 1', parentId: parent.id })

          const res = await ctx.request(`/api/locations/${parent.id}`, { method: 'DELETE', cookie: cookieFor(role) })

          expect(res.status).toBe(400)
          expect(((await res.json()) as ErrorBody).error).toBe(
            'Cannot delete location: it has child locations. Delete them first.',
          )
          expect(await loadLocation(parent.id)).toBeDefined()
          expect(await loadLocation(shelf.id)).toBeDefined()
        },
      )

      const collections = {
        'micronix plate': createTestMicronixPlate,
        'cryovial box': createTestCryovialBox,
        box: createTestBox,
        bag: createTestBag,
      }
      const heldCases = (['member', 'admin'] as const).flatMap((role) =>
        (Object.keys(collections) as Array<keyof typeof collections>).map((kind) => [role, kind] as const),
      )

      it.each(heldCases)('refuses a %s a Location that holds a %s', async (role, kind) => {
        const shelf = await freezer()
        await collections[kind](ctx.db, { name: 'Held', locationId: shelf.id })

        const res = await ctx.request(`/api/locations/${shelf.id}`, { method: 'DELETE', cookie: cookieFor(role) })

        expect(res.status).toBe(400)
        expect(((await res.json()) as ErrorBody).error).toBe(
          'Cannot delete location: it holds collections. Move them to another location first.',
        )
        expect(await loadLocation(shelf.id)).toBeDefined()
      })

      it('returns 403 to a viewer and deletes nothing', async () => {
        const shelf = await freezer()

        const res = await ctx.request(`/api/locations/${shelf.id}`, { method: 'DELETE', cookie: ctx.cookies.viewer })

        expect(res.status).toBe(403)
        expect(await loadLocation(shelf.id)).toBeDefined()
      })

      it('returns 404 when the Location does not exist', async () => {
        const res = await ctx.request('/api/locations/99999', { method: 'DELETE' })

        expect(res.status).toBe(404)
      })

      it('returns 400 for an ID that is not a number', async () => {
        const res = await ctx.request('/api/locations/abc', { method: 'DELETE' })

        expect(res.status).toBe(400)
        expect(((await res.json()) as ErrorBody).error).toBe('Invalid location ID')
      })

      it('returns 401 when not authenticated', async () => {
        const shelf = await freezer()

        const res = await ctx.request(`/api/locations/${shelf.id}`, { method: 'DELETE', cookie: null })

        expect(res.status).toBe(401)
        expect(await loadLocation(shelf.id)).toBeDefined()
      })
    })
  })
})
