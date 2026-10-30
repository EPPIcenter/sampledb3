import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createExportRoutes } from '../export'
import { errorLogs, specimen as specimenTable, study as studyTable, unit as unitTable } from '../../db/schema'
import { SQL_IN_CHUNK_SIZE } from '../../lib/sql-helpers'
import * as specimensCsv from '../../lib/export/specimens-csv'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
  createTestUnit,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestMicronixTube,
  createTestCryovialBox,
  createTestCryovialTube,
} from '../../__tests__/helpers/factories'

describe('Export API', () => {
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
        app.route('/api/export', createExportRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  /** One Subject in a new Study with a micronix tube and, optionally, a cryovial tube. */
  async function seedTypedContainers(shortCode: string, options: { cryovial: boolean }) {
    const study = await createTestStudy(ctx.db, { title: `${shortCode} Study`, shortCode })
    const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
    const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
    const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const storageType = await createTestStorageType(ctx.db, { name: 'Freezer -80' })
    const freezer = await createTestLocation(ctx.db, {
      name: 'Freezer',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    const plate = await createTestMicronixPlate(ctx.db, { name: 'Plate', locationId: freezer.id })
    const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
    const micronix = await createTestStorageContainer(ctx.db, { specimenId: spec.id, unitId: unit.id as number })
    await createTestMicronixTube(ctx.db, { containerId: micronix.id, collectionId: plate.id, barcode: `${shortCode}-MX` })
    let cryovialId: number | undefined
    if (options.cryovial) {
      const box = await createTestCryovialBox(ctx.db, { name: 'Box', locationId: freezer.id })
      const cryovial = await createTestStorageContainer(ctx.db, { specimenId: spec.id, unitId: unit.id as number })
      await createTestCryovialTube(ctx.db, { containerId: cryovial.id, collectionId: box.id })
      cryovialId = cryovial.id
    }
    return { micronixId: micronix.id, cryovialId }
  }

  describe('GET /api/export/specimens.csv', () => {
    it('returns 200 with auth and CSV content type', async () => {
      const res = await ctx.request('/api/export/specimens.csv', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const contentType = res.headers.get('Content-Type') ?? ''
      expect(contentType.toLowerCase()).toMatch(/text\/csv|text\/plain/)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/export/specimens.csv', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/export/inventory.csv', () => {
    it('returns 200 with auth and CSV content', async () => {
      const res = await ctx.request('/api/export/inventory.csv', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toMatch(/text\/csv|text\/plain/)
      const text = await res.text()
      expect(text).toMatch(/subject|control|inventory/i)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/export/inventory.csv', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/export/containers', () => {
    it('returns 400 when study parameter is missing', async () => {
      const res = await ctx.request('/api/export/containers', {
        method: 'GET',
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/study.*required/i)
    })

    it('returns 404 when study does not exist', async () => {
      const rowsBefore = await ctx.db.select().from(errorLogs)
      const res = await ctx.request('/api/export/containers?study=NONEXISTENT', {
        method: 'GET',
      })
      expect(res.status).toBe(404)
      await new Promise((resolve) => setTimeout(resolve, 50))
      const rowsAfter = await ctx.db.select().from(errorLogs)
      expect(rowsAfter.length).toBe(rowsBefore.length)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/export/containers?study=ST1', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns 200 with CSV when study has containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Export Study', shortCode: 'EXPORT' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=EXPORT&format=csv&csv_bom=false&csv_line_ending=LF', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const contentType = res.headers.get('Content-Type')?.toLowerCase() ?? ''
      expect(contentType).toMatch(/text\/csv|text\/plain/)
      const text = await res.text()
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toContain('=""')
    })

    it('returns 200 with count_only when study has containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Count Study', shortCode: 'COUNT' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Serum' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=COUNT&count_only=true', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { count: number }
      expect(data).toHaveProperty('count')
      expect(data.count).toBe(1)
    })

    it('returns 200 with format=json when study has containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'JSON Study', shortCode: 'JSON' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Plasma' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=JSON&format=json', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toContain('application/json')
      const data = await res.json()
      expect(data).toBeDefined()
      expect(typeof data).toBe('object')
    })

    it('returns 200 with format=xlsx when study has containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Excel Study', shortCode: 'XLSX' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Serum' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=XLSX&format=xlsx', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toMatch(/spreadsheet|excel|xlsx/)
      const buf = await res.arrayBuffer()
      expect(buf.byteLength).toBeGreaterThan(0)
    })

    it('returns 200 with count_only when study has no subjects', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Brand New Study', shortCode: 'EMPTY' })
      // No subjects, specimens, or containers

      const res = await ctx.request('/api/export/containers?study=EMPTY&count_only=true', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { count: number }
      expect(data).toHaveProperty('count')
      expect(data.count).toBe(0)
    })

    it('returns 404 when study has no containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Empty Study', shortCode: 'EMPTY' })
      await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      // No specimen/container

      const rowsBefore = await ctx.db.select().from(errorLogs)
      const res = await ctx.request('/api/export/containers?study=EMPTY', {
        method: 'GET',
      })
      expect(res.status).toBe(404)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/no containers found/i)
      await new Promise((resolve) => setTimeout(resolve, 50))
      const rowsAfter = await ctx.db.select().from(errorLogs)
      expect(rowsAfter.length).toBe(rowsBefore.length)
    })

    it('exports only Containers of the requested container_types', async () => {
      const { cryovialId } = await seedTypedContainers('TYPES', { cryovial: true })

      const res = await ctx.request('/api/export/containers?study=TYPES&format=json&container_types=cryovial_tube', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        export_metadata: { count: number }
        containers: Array<{ container_id: number; container_type: string }>
      }
      expect(data.containers.map((row) => [row.container_id, row.container_type])).toEqual([
        [cryovialId, 'cryovial_tube'],
      ])
      expect(data.export_metadata.count).toBe(1)

      const countRes = await ctx.request('/api/export/containers?study=TYPES&count_only=true&container_types=cryovial_tube', {
        method: 'GET',
      })
      expect(await countRes.json()).toEqual({ count: 1 })
    })

    it('returns 404 when every Container in the study is of another container type', async () => {
      await seedTypedContainers('MXONLY', { cryovial: false })

      const res = await ctx.request('/api/export/containers?study=MXONLY&format=csv&container_types=cryovial_tube', {
        method: 'GET',
      })
      expect(res.status).toBe(404)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toBe('No containers found for this study')

      const countRes = await ctx.request('/api/export/containers?study=MXONLY&count_only=true&container_types=cryovial_tube', {
        method: 'GET',
      })
      expect(await countRes.json()).toEqual({ count: 0 })
    })

    it('returns 400 for invalid format', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Fmt Study', shortCode: 'FMT' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=FMT&format=invalid', {
        method: 'GET',
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/invalid format|csv, xlsx, or json/i)
    })
  })

  describe('POST /api/export/containers', () => {
    it('returns ADR-0002 envelope with base64 CSV, filename, and summary', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Post Study', shortCode: 'POST1' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers', {
        method: 'POST',
        json: {
          study: 'POST1',
          subject_names: ['Subj1'],
          format: 'csv',
          csv_bom: false,
          csv_line_ending: 'LF',
        },
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        summary?: { total_containers?: number }
        data?: string
        format?: string
        filename?: string
      }
      expect(data.format).toBe('csv')
      expect(data.filename).toMatch(/\.csv$/)
      expect(typeof data.data).toBe('string')
      expect(data.summary?.total_containers).toBe(1)
      expect(Buffer.from(data.data!, 'base64').toString('utf8')).not.toContain('=""')
    })
  })

  describe('POST /api/export/containers filters', () => {
    type PostSummary = {
      total_containers: number
      subjects_with_results: Array<{ name: string; count: number }>
      subjects_no_results: string[]
      subjects_not_found: string[]
    }

    /** POST a CSV export; return its summary and each row's container_id and container_type. */
    async function postCsvExport(body: Record<string, unknown>) {
      const res = await ctx.request('/api/export/containers', {
        method: 'POST',
        json: { ...body, format: 'csv', csv_bom: false, csv_line_ending: 'LF' },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { summary: PostSummary; data: string }
      const [header, ...lines] = Buffer.from(data.data, 'base64').toString('utf8').trim().split('\n')
      expect(header.startsWith('container_id,container_type,')).toBe(true)
      const rows = lines.map((line) => {
        const [id, type] = line.split(',')
        return [Number(id), type] as const
      })
      return { summary: data.summary, rows }
    }

    it('exports and counts only Containers of the requested container_types', async () => {
      const { cryovialId } = await seedTypedContainers('PTYPES', { cryovial: true })
      const body = { study: 'PTYPES', subject_names: ['Subj1', 'Ghost'], container_types: ['cryovial_tube'] }

      const exported = await postCsvExport(body)
      expect(exported.rows).toEqual([[cryovialId, 'cryovial_tube']])
      expect(exported.summary).toEqual({
        total_containers: 1,
        subjects_with_results: [{ name: 'Subj1', count: 1 }],
        subjects_no_results: [],
        subjects_not_found: ['Ghost'],
      })

      const countRes = await ctx.request('/api/export/containers', {
        method: 'POST',
        json: { ...body, count_only: true },
      })
      const counted = (await countRes.json()) as { count: number; summary: PostSummary }
      expect(counted.count).toBe(1)
      expect(counted.summary.total_containers).toBe(1)
      expect(counted.summary.subjects_not_found).toEqual(['Ghost'])
    })

    it('applies per-subject dates with tolerance, and the global range to undated subjects', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Dates Study', shortCode: 'PDATES' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const containerOn = async (subjectId: number, collectionDate: string) => {
        const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subjectId })
        await ctx.db.update(specimenTable).set({ collectionDate }).where(eq(specimenTable.id, spec.id))
        return (await createTestStorageContainer(ctx.db, { specimenId: spec.id, unitId: unit.id as number })).id
      }
      const dated = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Dated' })
      const undated = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Undated' })
      const datedJan = await containerOn(dated.id, '2024-01-01')
      await containerOn(dated.id, '2024-03-01')
      await containerOn(undated.id, '2024-01-15')
      const undatedFeb = await containerOn(undated.id, '2024-02-15')

      const exported = await postCsvExport({
        study: 'PDATES',
        subject_names: ['Dated', 'Undated'],
        subject_dates: { Dated: { exact: '2024-01-02' } },
        date_tolerance: 1,
        date_from: '2024-02-01',
      })
      expect(exported.rows.map(([id]) => id).sort((a, b) => a - b)).toEqual([datedJan, undatedFeb])
      expect(exported.summary.total_containers).toBe(2)
    })

    it('treats a Subject whose subject_dates entry is null as undated', async () => {
      const { micronixId } = await seedTypedContainers('PNULL', { cryovial: false })

      const exported = await postCsvExport({
        study: 'PNULL',
        subject_names: ['Subj1'],
        subject_dates: { Subj1: null },
      })

      expect(exported.rows).toEqual([[micronixId, 'micronix_tube']])
    })

    it.each([
      ['a string', '2024-01-01'],
      ['an array', [{ exact: '2024-01-01' }]],
      ['an entry that is not a date filter', { Subj1: 'yesterday' }],
      ['an exact date that is not a string', { Subj1: { exact: 20240101 } }],
      ['a date filter with an unknown key', { Subj1: [{ on: '2024-01-01' }] }],
    ])('returns 400 when subject_dates is %s', async (_, subjectDates) => {
      await seedTypedContainers('PBAD', { cryovial: false })

      const res = await ctx.request('/api/export/containers', {
        method: 'POST',
        json: { study: 'PBAD', subject_names: ['Subj1'], subject_dates: subjectDates, format: 'csv' },
      })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ errorCode: 'VALIDATION_ERROR' })
    })
  })

  describe('POST /api/export/containers subject_dates', () => {
    async function seedSubjectWithSpecimen() {
      const study = await createTestStudy(ctx.db, { title: 'Dates Study', shortCode: 'DATES1' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await ctx.db.update(specimenTable).set({ collectionDate: '2024-01-15' }).where(eq(specimenTable.id, spec.id))
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })
    }

    function countFor(subjectDates: unknown) {
      return ctx.request('/api/export/containers', {
        method: 'POST',
        json: { study: 'DATES1', subject_names: ['Subj1'], count_only: true, subject_dates: subjectDates },
      })
    }

    it.each([
      ['an empty entry', { Subj1: {} }],
      ['a non-object map', 'Subj1'],
      ['a non-string date', { Subj1: { exact: 20240115 } }],
    ])('rejects %s with 400', async (_label, subjectDates) => {
      await seedSubjectWithSpecimen()

      const res = await countFor(subjectDates)

      expect(res.status).toBe(400)
    })

    it('treats an empty list as every date for that subject', async () => {
      await seedSubjectWithSpecimen()

      const res = await countFor({ Subj1: [] })

      expect(res.status).toBe(200)
      expect(((await res.json()) as { count: number }).count).toBe(1)
    })

    it('filters by the listed dates', async () => {
      await seedSubjectWithSpecimen()

      const hit = await countFor({ Subj1: [{ exact: '2024-01-15' }] })
      const miss = await countFor({ Subj1: [{ from: '2024-02-01' }] })

      expect(((await hit.json()) as { count: number }).count).toBe(1)
      expect(((await miss.json()) as { count: number }).count).toBe(0)
    })
  })

  describe('POST /api/export/containers/validate-studies', () => {
    it('returns valid and invalid study codes', async () => {
      await createTestStudy(ctx.db, { title: 'Valid', shortCode: 'VALID' })

      const res = await ctx.request('/api/export/containers/validate-studies', {
        method: 'POST',
        json: { study_codes: ['VALID', 'NOPE'] },
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid_count?: number; invalid_count?: number; invalid?: string[] }
      expect(data.valid_count).toBe(1)
      expect(data.invalid_count).toBe(1)
      expect(data.invalid).toContain('NOPE')
    })
  })

  describe('POST /api/export/containers/multi-study', () => {
    it('returns ADR-0002 envelope for multi-study CSV export', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Multi', shortCode: 'MULTI1' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Alice' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers/multi-study', {
        method: 'POST',
        json: {
          entries: [{ study_short_code: 'MULTI1', subject_name: 'Alice' }],
          format: 'csv',
          csv_bom: false,
          csv_line_ending: 'LF',
        },
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as { format?: string; filename?: string; data?: string; summary?: unknown }
      expect(data.format).toBe('csv')
      expect(data.filename).toMatch(/multi_study_export.*\.csv$/)
      expect(typeof data.data).toBe('string')
      expect(data.summary).toBeDefined()
    })
  })

  describe('POST /api/export/containers/by-barcodes', () => {
    it('returns ADR-0002 envelope for barcode CSV export', async () => {
      const res = await ctx.request('/api/export/containers/by-barcodes', {
        method: 'POST',
        json: {
          barcodes: ['UNKNOWN-BARCODE'],
          format: 'json',
        },
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        format?: string
        filename?: string
        data?: unknown
        summary?: { barcodes_not_found?: string[] }
      }
      expect(data.format).toBe('json')
      expect(data.filename).toMatch(/barcode_export.*\.json$/)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.summary?.barcodes_not_found).toContain('UNKNOWN-BARCODE')
    })
  })

  describe('GET /api/export/available-types', () => {
    it('returns 400 when study parameter is missing', async () => {
      const res = await ctx.request('/api/export/available-types', { method: 'GET' })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Study parameter is required', errorCode: 'VALIDATION_ERROR' })
    })

    it('returns 404 when study does not exist', async () => {
      const res = await ctx.request('/api/export/available-types?study=NOPE', { method: 'GET' })
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: 'Study not found' })
    })

    it("lists the Study's specimen types and container types", async () => {
      await seedTypedContainers('TYPES', { cryovial: true })
      const other = await createTestStudy(ctx.db, { title: 'Other', shortCode: 'OTHER' })
      const otherSubject = await createTestStudySubject(ctx.db, { studyId: other.id, name: 'Subj1' })
      const plasma = await createTestSpecimenType(ctx.db, { name: 'Plasma' })
      const [unit] = await ctx.db.select().from(unitTable)
      await createTestStorageContainer(ctx.db, {
        specimenId: (await createTestSpecimen(ctx.db, plasma.id, { studySubjectId: otherSubject.id })).id,
        unitId: unit.id,
      })

      const res = await ctx.request('/api/export/available-types?study=TYPES', { method: 'GET' })

      expect(res.status).toBe(200)
      const data = (await res.json()) as { specimen_types: Array<{ id: number; name: string }>; container_types: string[] }
      expect(data.specimen_types.map((type) => type.name)).toEqual(['Blood'])
      expect(data.container_types).toEqual(['micronix_tube', 'cryovial_tube'])
    })

    it('returns empty lists for a Study with Specimens but no Containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Bare', shortCode: 'BARE' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Plasma' })
      await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })

      const res = await ctx.request('/api/export/available-types?study=BARE', { method: 'GET' })

      expect(await res.json()).toEqual({ specimen_types: [{ id: specimenType.id, name: 'Plasma' }], container_types: [] })
    })

    it('lists the types of a Study with more Subjects than SQLite allows as bound parameters', async () => {
      await seedTypedContainers('BIG', { cryovial: false })
      const [big] = await ctx.db.select().from(studyTable).where(eq(studyTable.shortCode, 'BIG'))
      ctx.sqlite.exec('BEGIN')
      const addSubject = ctx.sqlite.prepare(
        "INSERT INTO study_subject (study_id, name, created, last_updated) VALUES (?, ?, '2024-01-01', '2024-01-01')",
      )
      for (let i = 0; i < SQL_IN_CHUNK_SIZE * 140; i++) addSubject.run(big.id, `S${i}`)
      ctx.sqlite.exec('COMMIT')

      const res = await ctx.request('/api/export/available-types?study=BIG', { method: 'GET' })

      expect(res.status).toBe(200)
      const data = (await res.json()) as { specimen_types: Array<{ name: string }>; container_types: string[] }
      expect(data.specimen_types.map((type) => type.name)).toEqual(['Blood'])
      expect(data.container_types).toEqual(['micronix_tube'])
    }, 60_000)
  })

  describe('error persistence', () => {
    it('persists export 500 failures to error_logs with stable client body', async () => {
      const spy = vi
        .spyOn(specimensCsv, 'exportSpecimensCsv')
        .mockRejectedValueOnce(new Error('Simulated export failure'))

      const res = await ctx.request('/api/export/specimens.csv', { method: 'GET' })
      expect(res.status).toBe(500)
      const data = (await res.json()) as { error?: string; details?: string }
      expect(data.error).toBe('Failed to export specimens')
      expect(data.details).toBe('Simulated export failure')

      await new Promise((resolve) => setTimeout(resolve, 50))
      const rows = await ctx.db
        .select()
        .from(errorLogs)
        .where(eq(errorLogs.message, 'Failed to export specimens'))
      expect(rows.length).toBeGreaterThanOrEqual(1)

      spy.mockRestore()
    })
  })
})
