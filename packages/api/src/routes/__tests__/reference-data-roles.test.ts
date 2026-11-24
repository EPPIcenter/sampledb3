import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createSpecimenTypesRoutes } from '../specimen-types'
import { createStorageTypesRoutes } from '../storage-types'
import { createStrainsRoutes } from '../strains'
import { createUnitsRoutes } from '../units'
import { specimenType, storageType, strain, unit } from '../../db/schema'

/**
 * Members create Tags (#141, tested in tags.test.ts). The rest of the Reference data stays
 * admin-only, because imports and exports match on it.
 */
describe('Reference data a member cannot create', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: { email: 'member@test.com', role: 'member' },
      additionalUsers: [{ key: 'admin', email: 'admin@test.com', role: 'admin' }],
      mount: (app, { db }) => {
        app.route('/api/specimen-types', createSpecimenTypesRoutes(db))
        app.route('/api/storage-types', createStorageTypesRoutes(db))
        app.route('/api/strains', createStrainsRoutes(db))
        app.route('/api/units', createUnitsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  const entities = [
    { path: '/api/specimen-types', table: specimenType, json: { name: 'Member plasma' } },
    { path: '/api/storage-types', table: storageType, json: { name: 'Member freezer' } },
    { path: '/api/strains', table: strain, json: { name: 'Member strain' } },
    { path: '/api/units', table: unit, json: { symbol: 'mbr', name: 'Member unit', category: 'other' } },
  ]

  it.each(entities)('returns 403 to a member on POST $path and creates nothing', async ({ path, table, json }) => {
    const before = await ctx.db.select().from(table)

    const res = await ctx.request(path, { method: 'POST', json })

    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('Forbidden: Admin access required')
    expect(await ctx.db.select().from(table)).toEqual(before)
  })

  it.each(entities)('lets an admin POST $path', async ({ path, json }) => {
    const res = await ctx.request(path, { method: 'POST', cookie: ctx.cookies.admin, json })

    expect(res.status).toBe(201)
  })
})
