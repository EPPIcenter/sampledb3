import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupAuthenticatedRouteTest, type AuthenticatedRouteTestContext } from '../../__tests__/helpers/authenticated-route-test'
import { createQpcrExperimentsRoutes } from '../qpcr-experiments'
import { utcNow } from '../../lib/datetime'
import { qpcrExperiment, qpcrExperimentTarget, qpcrExperimentWell } from '../../db/schema'

describe('qPCR Experiments Template', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin User',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        app.route('/api/qpcr-experiments', createQpcrExperimentsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('POST /', () => {
    it('creates an experiment with one default target', async () => {
      const createRes = await ctx.request('/api/qpcr-experiments', {
        method: 'POST',
        json: { name: 'Default target test', templateFormat: 'biorad' },
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { id: number; name: string; templateFormat: string }
      expect(created.id).toBeDefined()
      expect(created.name).toBe('Default target test')
      expect(created.templateFormat).toBe('biorad')

      const getRes = await ctx.request(`/api/qpcr-experiments/${created.id}`)
      expect(getRes.status).toBe(200)
      const detail = (await getRes.json()) as { experiment: { targets: Array<{ targetName: string; fluorophore: string | null; reporter: string | null }> } }
      expect(detail.experiment.targets).toHaveLength(1)
      expect(detail.experiment.targets[0].targetName).toBe('varATS')
      expect(detail.experiment.targets[0].fluorophore).toBe('FAM')
      expect(detail.experiment.targets[0].reporter).toBe('FAM')
    })
  })

  describe('GET /:id/template', () => {
    it('includes only rows for wells that have a tube; skips positions with no tube', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Template test',
          templateFormat: 'biorad',
          status: 'setup',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      await ctx.db.insert(qpcrExperimentTarget).values({
        qpcrExperimentId: exp.id,
        targetName: 'varATS',
        fluorophore: 'FAM',
        reporter: 'FAM',
        sortOrder: 0,
      })

      await ctx.db.insert(qpcrExperimentWell).values([
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

      const bioradRes = await ctx.request(`/api/qpcr-experiments/${exp.id}/template?format=biorad`)
      expect(bioradRes.status).toBe(200)
      const bioradText = await bioradRes.text()
      const bioradLines = bioradText.split('\n').filter(Boolean)
      expect(bioradLines[0]).toBe('Well,Fluorophore,Target Name,Content,Sample Name,Quantity')
      expect(bioradLines.length).toBe(3)
      expect(bioradLines[1]).toContain('A1')
      expect(bioradLines[2]).toContain('A2')

      const quantRes = await ctx.request(`/api/qpcr-experiments/${exp.id}/template?format=quant_studio`)
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

    it('uses well barcode as Sample Name in template when barcode is set', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Barcode template test',
          templateFormat: 'biorad',
          status: 'setup',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      await ctx.db.insert(qpcrExperimentTarget).values({
        qpcrExperimentId: exp.id,
        targetName: 'varATS',
        fluorophore: 'FAM',
        reporter: 'FAM',
        sortOrder: 0,
      })

      await ctx.db.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        barcode: 'MT-001',
        contentType: 'unknown',
        standardDensity: null,
      })

      const bioradRes = await ctx.request(`/api/qpcr-experiments/${exp.id}/template?format=biorad`)
      expect(bioradRes.status).toBe(200)
      const bioradText = await bioradRes.text()
      const bioradLines = bioradText.split('\n').filter(Boolean)
      expect(bioradLines[0]).toBe('Well,Fluorophore,Target Name,Content,Sample Name,Quantity')
      expect(bioradLines[1]).toContain('MT-001')
      expect(bioradLines[1]).toBe('A1,FAM,varATS,Unk,MT-001,')

      const quantRes = await ctx.request(`/api/qpcr-experiments/${exp.id}/template?format=quant_studio`)
      expect(quantRes.status).toBe(200)
      const quantText = await quantRes.text()
      const quantLines = quantText.split('\n').filter(Boolean)
      const dataHeaderIdx = quantLines.findIndex((l) => l.startsWith('Well\tWell Position'))
      expect(dataHeaderIdx).toBeGreaterThanOrEqual(0)
      const dataLines = quantLines.slice(dataHeaderIdx + 1)
      expect(dataLines).toHaveLength(1)
      expect(dataLines[0]).toContain('MT-001')
      const quantCols = dataLines[0].split('\t')
      expect(quantCols[2]).toBe('MT-001')
    })

    it('returns 400 when experiment has no targets', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'No targets',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      await ctx.db.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await ctx.request(`/api/qpcr-experiments/${exp.id}/template?format=biorad`)
      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string; errorCode?: string }
      expect(body.error).toContain('Add at least one target')
      expect(body.errorCode).toBe('NO_TARGETS')
    })
  })

  describe('PATCH /:id/wells', () => {
    it('sets a single empty position to NTC and returns updated wells', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Wells patch test',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await ctx.db.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        barcode: 'TUBE01',
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await ctx.request(`/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
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
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Wells patch empty',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await ctx.db.insert(qpcrExperimentWell).values([
        { qpcrExperimentId: exp.id, wellPosition: 'A01', barcode: 'TUBE01', contentType: 'unknown', standardDensity: null },
        { qpcrExperimentId: exp.id, wellPosition: 'A02', barcode: null, contentType: 'negative', standardDensity: null },
      ])

      const res = await ctx.request(`/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        json: { wellPosition: 'A02', contentType: 'empty' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { wells: Array<{ wellPosition: string }> }
      const a02 = body.wells.find((w) => w.wellPosition === 'A02')
      expect(a02).toBeUndefined()
      expect(body.wells.length).toBe(1)
    })

    it('sets all empty wells to NTC (bulk)', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Wells bulk NTC',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await ctx.db.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        barcode: 'TUBE01',
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await ctx.request(`/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        json: { positions: ['A03', 'A04'], contentType: 'negative' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { wells: Array<{ wellPosition: string; contentType: string | null }> }
      expect(body.wells.length).toBe(3)
      expect(body.wells.find((w) => w.wellPosition === 'A03')?.contentType).toBe('negative')
      expect(body.wells.find((w) => w.wellPosition === 'A04')?.contentType).toBe('negative')
    })

    it('rejects setting a well with barcode to NTC', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Wells reject filled',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await ctx.db.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        barcode: 'TUBE01',
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await ctx.request(`/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        json: { wellPosition: 'A01', contentType: 'negative' },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; errorCode?: string }
      expect(body.error).toContain('sample or control')
      expect(body.errorCode).toBe('WELL_NOT_EMPTY')
    })

    it('rejects PATCH wells when experiment status is results_uploaded', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Wells locked',
          templateFormat: 'biorad',
          status: 'results_uploaded',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      const res = await ctx.request(`/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        json: { wellPosition: 'A03', contentType: 'negative' },
      })
      expect(res.status).toBe(409)
      const body = (await res.json()) as { error: string; errorCode?: string }
      expect(body.error).toContain('results have been imported')
      expect(body.errorCode).toBe('WELLS_LOCKED')
    })

    it('rejects invalid well position', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Wells invalid pos',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      const res = await ctx.request(`/api/qpcr-experiments/${exp.id}/wells`, {
        method: 'PATCH',
        json: { wellPosition: 'Z99', contentType: 'negative' },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Invalid well position')
    })
  })
})
