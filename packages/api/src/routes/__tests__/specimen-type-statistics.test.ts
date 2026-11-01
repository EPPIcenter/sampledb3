import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createTestSpecimen, createTestSpecimenType } from '../../__tests__/helpers/factories'
import { cache } from '../../lib/cache'
import { createSpecimenTypesRoutes } from '../specimen-types'
import { createStatisticsRoutes } from '../statistics'

// The dashboard statistics cache the Specimen type list; writes in Reference Data must refresh it.
describe('Specimen type writes and dashboard statistics', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    // The cache is process-wide, so drop whatever an earlier test's database left in it.
    cache.clear()
    ctx = await setupAuthenticatedRouteTest({
      user: { email: 'admin@test.com', name: 'Admin', password: 'password123', role: 'admin' },
      mount: (app, { db }) => {
        app.route('/api/specimen-types', createSpecimenTypesRoutes(db))
        app.route('/api/statistics', createStatisticsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
    cache.clear()
  })

  async function bySpecimenType(): Promise<Record<string, number>> {
    const res = await ctx.request('/api/statistics', { method: 'GET' })
    expect(res.status).toBe(200)
    return ((await res.json()) as { specimens: { bySpecimenType: Record<string, number> } }).specimens.bySpecimenType
  }

  it('shows a Specimen type added after the statistics were cached', async () => {
    const blood = await createTestSpecimenType(ctx.db, { name: 'Blood' })
    await createTestSpecimen(ctx.db, blood.id)
    expect(await bySpecimenType()).toEqual({ Blood: 1 })

    const res = await ctx.request('/api/specimen-types', { method: 'POST', json: { name: 'Saliva' } })
    expect(res.status).toBe(201)
    const { data: saliva } = (await res.json()) as { data: { id: number } }
    await createTestSpecimen(ctx.db, saliva.id)

    expect(await bySpecimenType()).toEqual({ Blood: 1, Saliva: 1 })
  })

  it('shows the new name of a renamed Specimen type', async () => {
    const blood = await createTestSpecimenType(ctx.db, { name: 'Blood' })
    await createTestSpecimen(ctx.db, blood.id)
    expect(await bySpecimenType()).toEqual({ Blood: 1 })

    const res = await ctx.request(`/api/specimen-types/${blood.id}`, { method: 'PUT', json: { name: 'Whole blood' } })
    expect(res.status).toBe(200)

    expect(await bySpecimenType()).toEqual({ 'Whole blood': 1 })
  })

  it('forgets a deleted Specimen type', async () => {
    const blood = await createTestSpecimenType(ctx.db, { name: 'Blood' })
    const unused = await createTestSpecimenType(ctx.db, { name: 'Unused' })
    await createTestSpecimen(ctx.db, blood.id)
    expect(await bySpecimenType()).toEqual({ Blood: 1 })

    const res = await ctx.request(`/api/specimen-types/${unused.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    // SQLite reuses the highest rowid, so a type added now takes the deleted type's id.
    const added = await createTestSpecimenType(ctx.db, { name: 'Saliva' })
    expect(added.id).toBe(unused.id)
    await createTestSpecimen(ctx.db, added.id)

    expect(await bySpecimenType()).toEqual({ Blood: 1, Saliva: 1 })
  })
})
