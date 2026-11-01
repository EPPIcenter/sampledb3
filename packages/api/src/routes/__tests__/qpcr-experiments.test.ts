import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupAuthenticatedRouteTest, type AuthenticatedRouteTestContext } from '../../__tests__/helpers/authenticated-route-test'
import { createQpcrExperimentsRoutes } from '../qpcr-experiments'
import { utcNow } from '../../lib/datetime'
import { eq } from 'drizzle-orm'
import {
  qpcrAmplificationData,
  qpcrExperiment,
  qpcrExperimentTarget,
  qpcrExperimentWell,
  qpcrRun,
  qpcrWellResult,
} from '../../db/schema'

const PLATE_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/**
 * A QuantStudio result workbook laid out like the instrument's export: a Results sheet with one
 * row per well and target, and an Amplification Data sheet with one row per well, target and cycle.
 */
async function quantStudioWorkbook(options: { targets: number; cycles: number }): Promise<string> {
  const XLSX = await import('xlsx')
  const results: Array<Array<string | number>> = [
    ['Well', 'Well Position', 'Sample Name', 'Target Name', 'Task', 'CT'],
  ]
  const amplification: Array<Array<string | number>> = [
    ['Well', 'Well Position', 'Cycle', 'Target Name', 'Rn', 'Delta Rn'],
  ]
  let well = 0
  for (const row of PLATE_ROWS) {
    for (let col = 1; col <= 12; col++) {
      well++
      const position = `${row}${col}`
      for (let t = 1; t <= options.targets; t++) {
        results.push([well, position, `S${well}`, `Target ${t}`, 'UNKNOWN', 25])
        for (let cycle = 1; cycle <= options.cycles; cycle++) {
          amplification.push([well, position, cycle, `Target ${t}`, cycle / 10, cycle / 100])
        }
      }
    }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(results), 'Results')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(amplification), 'Amplification Data')
  return (XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer).toString('base64')
}

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

  describe('PATCH / targets', () => {
    it('rejects duplicate target names and keeps the existing targets', async () => {
      const createRes = await ctx.request('/api/qpcr-experiments', {
        method: 'POST',
        json: { name: 'Dup targets', templateFormat: 'biorad' },
      })
      const created = (await createRes.json()) as { id: number }

      const res = await ctx.request(`/api/qpcr-experiments/${created.id}`, {
        method: 'PATCH',
        json: { targets: [{ targetName: '' }, { targetName: 'varATS' }] },
      })

      expect(res.status).toBe(400)
      const detail = (await (await ctx.request(`/api/qpcr-experiments/${created.id}`)).json()) as {
        experiment: { targets: Array<{ targetName: string }> }
      }
      expect(detail.experiment.targets.map((t) => t.targetName)).toEqual(['varATS'])
    })
  })

  describe('POST /:id/results', () => {
    it('keeps amplification rows for results that have no target name', async () => {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ['Well', 'Well Position', 'Sample Name', 'Task', 'CT'],
          [1, 'A1', 'S1', 'UNKNOWN', 22.1],
        ]),
        'Results',
      )
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ['Well', 'Well Position', 'Cycle', 'Rn', 'Delta Rn'],
          [1, 'A1', 1, 0.5, 0.01],
          [1, 'A1', 2, 0.6, 0.02],
        ]),
        'Amplification Data',
      )
      const fileContent = (XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer).toString('base64')
      const created = (await (
        await ctx.request('/api/qpcr-experiments', { method: 'POST', json: { name: 'Amp', templateFormat: 'quant_studio' } })
      ).json()) as { id: number }

      const res = await ctx.request(`/api/qpcr-experiments/${created.id}/results`, {
        method: 'POST',
        json: { fileContent, fileName: 'run.xls', instrumentType: 'QuantStudio' },
      })

      expect(res.status).toBeLessThan(300)
      const amp = await ctx.db.select().from(qpcrAmplificationData).all()
      expect(amp).toHaveLength(2)
    })

    async function createExperiment(): Promise<number> {
      const res = await ctx.request('/api/qpcr-experiments', {
        method: 'POST',
        json: { name: 'Large run', templateFormat: 'quant_studio' },
      })
      return ((await res.json()) as { id: number }).id
    }

    async function countRows() {
      return {
        runs: (await ctx.db.select().from(qpcrRun).all()).length,
        wellResults: (await ctx.db.select().from(qpcrWellResult).all()).length,
        amplification: (await ctx.db.select().from(qpcrAmplificationData).all()).length,
      }
    }

    it('records an upload with more than 20,000 amplification rows', async () => {
      // 96 wells x 5 targets x 42 cycles = 20,160 rows, 80,640 bound values unchunked.
      const fileContent = await quantStudioWorkbook({ targets: 5, cycles: 42 })
      const id = await createExperiment()

      const res = await ctx.request(`/api/qpcr-experiments/${id}/results`, {
        method: 'POST',
        json: { fileContent, fileName: 'large.xls', instrumentType: 'QuantStudio' },
      })

      expect(res.status).toBe(201)
      const body = (await res.json()) as { amplificationCount: number; wellResultCount: number }
      expect(body.amplificationCount).toBe(20_160)
      expect(body.wellResultCount).toBe(480)
      expect(await countRows()).toEqual({ runs: 1, wellResults: 480, amplification: 20_160 })
      const exp = await ctx.db.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, id)).get()
      expect(exp?.status).toBe('results_uploaded')
    })

    it('leaves no run or well results behind when an insert fails partway, and a retry records one run', async () => {
      const fileContent = await quantStudioWorkbook({ targets: 5, cycles: 42 })
      const id = await createExperiment()
      // Fail on the plate's last amplification row, after the run, every well result and the earlier chunks are written.
      ctx.sqlite.exec(`
        CREATE TRIGGER fail_last_amplification BEFORE INSERT ON qpcr_amplification_data
        WHEN NEW.cycle = 42 AND (SELECT well_position || target_name FROM qpcr_well_result WHERE id = NEW.qpcr_well_result_id) = 'H12Target 5'
        BEGIN SELECT RAISE(ABORT, 'simulated failure'); END
      `)

      const failed = await ctx.request(`/api/qpcr-experiments/${id}/results`, {
        method: 'POST',
        json: { fileContent, fileName: 'large.xls', instrumentType: 'QuantStudio' },
      })

      expect(failed.status).toBe(500)
      expect(await countRows()).toEqual({ runs: 0, wellResults: 0, amplification: 0 })
      const unchanged = await ctx.db.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, id)).get()
      expect(unchanged?.status).toBe('setup')

      ctx.sqlite.exec('DROP TRIGGER fail_last_amplification')
      const retried = await ctx.request(`/api/qpcr-experiments/${id}/results`, {
        method: 'POST',
        json: { fileContent, fileName: 'large.xls', instrumentType: 'QuantStudio' },
      })

      expect(retried.status).toBe(201)
      expect(await countRows()).toEqual({ runs: 1, wellResults: 480, amplification: 20_160 })
    })
  })

  describe('DELETE /:id', () => {
    async function experimentWithResults(): Promise<number> {
      const created = (await (
        await ctx.request('/api/qpcr-experiments', { method: 'POST', json: { name: 'Delete', templateFormat: 'quant_studio' } })
      ).json()) as { id: number }
      await ctx.db.insert(qpcrExperimentWell).values({ qpcrExperimentId: created.id, wellPosition: 'A01', contentType: 'unknown' })
      const res = await ctx.request(`/api/qpcr-experiments/${created.id}/results`, {
        method: 'POST',
        json: { fileContent: await quantStudioWorkbook({ targets: 1, cycles: 2 }), fileName: 'run.xls', instrumentType: 'QuantStudio' },
      })
      expect(res.status).toBe(201)
      return created.id
    }

    it('deletes the experiment with its wells, runs, well results and amplification data', async () => {
      const id = await experimentWithResults()

      const res = await ctx.request(`/api/qpcr-experiments/${id}`, { method: 'DELETE' })

      expect(res.status).toBe(204)
      expect(await ctx.db.select().from(qpcrExperiment).all()).toHaveLength(0)
      expect(await ctx.db.select().from(qpcrExperimentWell).all()).toHaveLength(0)
      expect(await ctx.db.select().from(qpcrRun).all()).toHaveLength(0)
      expect(await ctx.db.select().from(qpcrWellResult).all()).toHaveLength(0)
      expect(await ctx.db.select().from(qpcrAmplificationData).all()).toHaveLength(0)
    })

    it('keeps every related row when the delete fails partway', async () => {
      const id = await experimentWithResults()
      ctx.sqlite.exec(`
        CREATE TRIGGER fail_experiment_delete BEFORE DELETE ON qpcr_experiment
        BEGIN SELECT RAISE(ABORT, 'simulated failure'); END
      `)

      const res = await ctx.request(`/api/qpcr-experiments/${id}`, { method: 'DELETE' })

      expect(res.status).toBe(500)
      expect(await ctx.db.select().from(qpcrExperiment).all()).toHaveLength(1)
      expect(await ctx.db.select().from(qpcrExperimentWell).all()).toHaveLength(1)
      expect(await ctx.db.select().from(qpcrRun).all()).toHaveLength(1)
      expect(await ctx.db.select().from(qpcrWellResult).all()).toHaveLength(96)
      expect(await ctx.db.select().from(qpcrAmplificationData).all()).toHaveLength(192)
    })
  })

  describe('POST /:id/plate', () => {
    it('keeps the previous wells and status when the upload fails partway', async () => {
      const created = (await (
        await ctx.request('/api/qpcr-experiments', { method: 'POST', json: { name: 'Plate', templateFormat: 'biorad' } })
      ).json()) as { id: number }
      await ctx.db.insert(qpcrExperimentWell).values({
        qpcrExperimentId: created.id,
        wellPosition: 'A01',
        barcode: 'OLD-1',
        contentType: 'unknown',
      })
      ctx.sqlite.exec(`
        CREATE TRIGGER fail_status_change BEFORE UPDATE OF status ON qpcr_experiment
        BEGIN SELECT RAISE(ABORT, 'simulated failure'); END
      `)

      const res = await ctx.request(`/api/qpcr-experiments/${created.id}/plate`, {
        method: 'POST',
        json: { csvText: 'Tube ID,Position\nNEW-1,A01\n', scannerConfigurationId: 'traxcer' },
      })

      expect(res.status).toBe(500)
      const wells = await ctx.db.select().from(qpcrExperimentWell).all()
      expect(wells.map((w) => w.barcode)).toEqual(['OLD-1'])
      const exp = await ctx.db.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, created.id)).get()
      expect(exp?.status).toBe('setup')
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

    it('quotes fields that hold a delimiter or quote and writes missing values as empty', async () => {
      const [exp] = await ctx.db
        .insert(qpcrExperiment)
        .values({
          name: 'Quoting',
          templateFormat: 'biorad',
          status: 'in_progress',
          created: utcNow(),
          lastUpdated: utcNow(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')
      await ctx.db.insert(qpcrExperimentTarget).values({
        qpcrExperimentId: exp.id,
        targetName: 'var,ATS "v2"\tB',
        fluorophore: null,
        reporter: null,
        sortOrder: 0,
      })
      await ctx.db.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        barcode: 'MT,001',
        contentType: 'unknown',
      })

      const biorad = await (await ctx.request(`/api/qpcr-experiments/${exp.id}/template?format=biorad`)).text()
      expect(biorad).toBe(
        'Well,Fluorophore,Target Name,Content,Sample Name,Quantity\n' +
          'A1,,"var,ATS ""v2""\tB",Unk,"MT,001",',
      )

      const quant = await (await ctx.request(`/api/qpcr-experiments/${exp.id}/template?format=quant_studio`)).text()
      const lines = quant.split('\n')
      expect(lines).toContain('* Instrument Type = ')
      expect(lines.at(-1)).toBe('1\tA1\tMT,001\t"var,ATS ""v2""\tB"\tUNKNOWN\t\tNFQ-MGB\t')
      expect(quant).not.toContain('null')
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
      expect(a03!.barcode).toBeUndefined()
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
