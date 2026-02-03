import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { Hono } from 'hono'
import { createAuthRoutes } from '../auth'
import { createQpcrExperimentsRoutes } from '../qpcr-experiments'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { createTestUser, setupPasswordRequirements, setupSessionSettings } from '../../__tests__/helpers/auth-helpers'
import { handleRouteError } from '../../lib/error-handler'
import { qpcrExperiment, qpcrExperimentTarget, qpcrExperimentWell } from '../../db/schema'

describe('qPCR Experiments Template', () => {
  let app: Hono
  let testDb: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)
    await createTestUser(testDb, {
      email: 'admin@test.com',
      name: 'Admin User',
      password: 'password123',
      role: 'admin',
    })

    app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.onError((err, c) => handleRouteError(err, c))
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    app.route('/api/qpcr-experiments', createQpcrExperimentsRoutes(testDb))
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /:id/template', () => {
    it('includes only rows for wells that have a tube; skips positions with no tube', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')

      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Template test',
          templateFormat: 'biorad',
          status: 'setup',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      await testDb.insert(qpcrExperimentTarget).values({
        qpcrExperimentId: exp.id,
        targetName: 'varATS',
        fluorophore: 'FAM',
        reporter: 'FAM',
        sortOrder: 0,
      })

      await testDb.insert(qpcrExperimentWell).values([
        {
          qpcrExperimentId: exp.id,
          wellPosition: 'A01',
          contentType: 'unknown',
          standardDensity: null,
        },
        {
          qpcrExperimentId: exp.id,
          wellPosition: 'A02',
          contentType: 'unknown',
          standardDensity: null,
        },
      ])

      const bioradRes = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/template?format=biorad`, {
        cookie,
      })
      expect(bioradRes.status).toBe(200)
      const bioradText = await bioradRes.text()
      const bioradLines = bioradText.split('\n').filter(Boolean)
      expect(bioradLines[0]).toBe('Well,Fluorophore,Target Name,Content,Sample Name,Quantity')
      expect(bioradLines.length).toBe(3)
      expect(bioradLines[1]).toContain('A1')
      expect(bioradLines[2]).toContain('A2')

      const quantRes = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/template?format=quant_studio`, {
        cookie,
      })
      expect(quantRes.status).toBe(200)
      const quantText = await quantRes.text()
      const quantLines = quantText.split('\n').filter(Boolean)
      const dataHeaderIdx = quantLines.findIndex((l) => l.startsWith('Well\tWell Position'))
      expect(dataHeaderIdx).toBeGreaterThanOrEqual(0)
      const dataLines = quantLines.slice(dataHeaderIdx + 1)
      expect(dataLines.length).toBe(2)
      expect(dataLines[0]).toContain('A1')
      expect(dataLines[1]).toContain('A2')
    })

    it('returns 400 when experiment has no targets', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')

      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'No targets',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      await testDb.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/template?format=biorad`, {
        cookie,
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string; errorCode?: string }
      expect(body.error).toContain('Add at least one target')
      expect(body.errorCode).toBe('NO_TARGETS')
    })
  })

  describe('PATCH /:id/wells', () => {
    it('sets a single empty position to NTC and returns updated wells', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')
      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Wells patch test',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await testDb.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        barcode: 'TUBE01',
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        cookie,
        json: { wellPosition: 'A03', contentType: 'negative' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { wells: Array<{ wellPosition: string; contentType: string | null; barcode: string | null }> }
      expect(body.wells).toBeDefined()
      const a03 = body.wells.find((w) => w.wellPosition === 'A03')
      expect(a03).toBeDefined()
      expect(a03!.contentType).toBe('negative')
      expect(a03!.barcode).toBeNull()
    })

    it('sets a single NTC well to empty (removes row)', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')
      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Wells patch empty',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await testDb.insert(qpcrExperimentWell).values([
        { qpcrExperimentId: exp.id, wellPosition: 'A01', barcode: 'TUBE01', contentType: 'unknown', standardDensity: null },
        { qpcrExperimentId: exp.id, wellPosition: 'A02', barcode: null, contentType: 'negative', standardDensity: null },
      ])

      const res = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        cookie,
        json: { wellPosition: 'A02', contentType: 'empty' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { wells: Array<{ wellPosition: string }> }
      const a02 = body.wells.find((w) => w.wellPosition === 'A02')
      expect(a02).toBeUndefined()
      expect(body.wells.length).toBe(1)
    })

    it('sets all empty wells to NTC (bulk)', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')
      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Wells bulk NTC',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await testDb.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        barcode: 'TUBE01',
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        cookie,
        json: { positions: ['A03', 'A04'], contentType: 'negative' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { wells: Array<{ wellPosition: string; contentType: string | null }> }
      expect(body.wells.length).toBe(3)
      expect(body.wells.find((w) => w.wellPosition === 'A03')?.contentType).toBe('negative')
      expect(body.wells.find((w) => w.wellPosition === 'A04')?.contentType).toBe('negative')
    })

    it('rejects setting a well with barcode to NTC', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')
      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Wells reject filled',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await testDb.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        barcode: 'TUBE01',
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        cookie,
        json: { wellPosition: 'A01', contentType: 'negative' },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; errorCode?: string }
      expect(body.error).toContain('sample or control')
      expect(body.errorCode).toBe('WELL_NOT_EMPTY')
    })

    it('rejects PATCH wells when experiment status is results_uploaded', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')
      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Wells locked',
          templateFormat: 'biorad',
          status: 'results_uploaded',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      const res = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        cookie,
        json: { wellPosition: 'A03', contentType: 'negative' },
      })
      expect(res.status).toBe(409)
      const body = (await res.json()) as { error: string; errorCode?: string }
      expect(body.error).toContain('results have been imported')
      expect(body.errorCode).toBe('WELLS_LOCKED')
    })

    it('rejects invalid well position', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')
      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Wells invalid pos',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      const res = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        cookie,
        json: { wellPosition: 'Z99', contentType: 'negative' },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Invalid well position')
    })
  })
})
