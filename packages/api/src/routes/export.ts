import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Database } from '../db/client'
import {
  handleRouteError,
  ExpectedNotFoundError,
  RouteError,
} from '../lib/error-handler'
import { specimenType } from '../db/schema'
import { inArray } from 'drizzle-orm'
import { CONTAINER_TYPES, selectContainers } from '../lib/container-selection'
import { resolveStudyByShortCode } from '../lib/identifier-resolution'
import {
  formatExportTimestamp,
  parseCSVExportOptions,
  runBarcodeContainerExportPost,
  runMultiStudyContainerExportPost,
  runSingleStudyContainerExportGet,
  runSingleStudyContainerExportPost,
  runValidateStudyCodesExport,
  type ContainerExportFormat,
} from '../lib/export/container-export'
import { exportInventoryCsv } from '../lib/export/inventory-csv'
import { exportSpecimensCsv } from '../lib/export/specimens-csv'
import type { ExportFilters, MultiStudyExportEntry } from '../lib/export/types'
import { createAuthMiddleware } from '../middleware/auth'

function parseTagIds(values: string[] | undefined): number[] | undefined {
  if (!values || values.length === 0) return undefined
  const ids = values.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
  return ids.length > 0 ? ids : undefined
}

function parseTagIdsFromBody(body: unknown): number[] | undefined {
  if (!body || typeof body !== 'object' || !('tag_ids' in body)) return undefined
  const raw = (body as { tag_ids?: unknown }).tag_ids
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const ids = raw.map((id) => parseInt(String(id), 10)).filter((id) => !Number.isNaN(id))
  return ids.length > 0 ? ids : undefined
}

function handleExportFailure(c: Context, message: string, error: unknown): Response {
  if (error instanceof ExpectedNotFoundError || error instanceof RouteError) {
    return handleRouteError(error, c)
  }
  const details = error instanceof Error ? error.message : String(error)
  return handleRouteError(new RouteError(500, { error: message, details }), c)
}

function parseColumnsParam(raw: unknown): string[] | undefined {
  if (!raw) return undefined
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return JSON.parse(raw) as string[]
  return undefined
}

function parseExportFormat(raw: unknown, fallback: ContainerExportFormat = 'json'): ContainerExportFormat {
  return (raw || fallback) as ContainerExportFormat
}

function buildGetFilters(c: { req: { query: (key: string) => string | undefined; queries: (key: string) => string[] | undefined } }, studyCode: string): ExportFilters {
  const filters: ExportFilters = { study: studyCode }

  const specimenTypeIds = c.req.queries('specimen_type_ids')
  if (specimenTypeIds?.length) {
    filters.specimen_type_ids = specimenTypeIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
  }

  const containerTypes = c.req.queries('container_types')
  if (containerTypes?.length) {
    filters.container_types = containerTypes
  }

  const subjectIds = c.req.queries('subject_ids')
  if (subjectIds?.length) {
    filters.subject_ids = subjectIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
  }

  const tagIds = parseTagIds(c.req.queries('tag_ids'))
  if (tagIds) filters.tag_ids = tagIds

  if (c.req.query('date_from')) filters.date_from = c.req.query('date_from') as string
  if (c.req.query('date_to')) filters.date_to = c.req.query('date_to') as string
  if (c.req.query('created_from')) filters.created_from = c.req.query('created_from') as string
  if (c.req.query('created_to')) filters.created_to = c.req.query('created_to') as string

  return filters
}

function buildPostFilters(body: Record<string, unknown>): Omit<ExportFilters, 'study' | 'subject_ids' | 'subject_dates'> {
  const filters: Omit<ExportFilters, 'study' | 'subject_ids' | 'subject_dates'> = {}

  if (Array.isArray(body.specimen_type_ids)) {
    filters.specimen_type_ids = body.specimen_type_ids
      .map((id) => parseInt(String(id), 10))
      .filter((id) => !Number.isNaN(id))
  }

  if (Array.isArray(body.container_types)) {
    filters.container_types = body.container_types.map(String)
  }

  const tagIds = parseTagIdsFromBody(body)
  if (tagIds) filters.tag_ids = tagIds

  if (typeof body.date_from === 'string') filters.date_from = body.date_from
  if (typeof body.date_to === 'string') filters.date_to = body.date_to
  if (typeof body.created_from === 'string') filters.created_from = body.created_from
  if (typeof body.created_to === 'string') filters.created_to = body.created_to

  return filters
}

export function createExportRoutes(database: Database): Hono {
  const export_ = new Hono()
  const authMiddleware = createAuthMiddleware(database)

  export_.get('/specimens.csv', authMiddleware, async (c) => {
    try {
      const csv = await exportSpecimensCsv(
        database,
        {
          studyCode: c.req.query('study'),
          sourceType: c.req.query('source_type') as 'subject' | 'control' | undefined,
        },
        parseCSVExportOptions(c.req.query())
      )
      c.header('Content-Type', 'text/csv')
      c.header('Content-Disposition', `attachment; filename="specimens_${formatExportTimestamp()}.csv"`)
      return c.text(csv)
    } catch (error) {
      return handleExportFailure(c, 'Failed to export specimens', error)
    }
  })

  export_.get('/inventory.csv', authMiddleware, async (c) => {
    try {
      const csv = await exportInventoryCsv(database, parseCSVExportOptions(c.req.query()))
      c.header('Content-Type', 'text/csv')
      c.header('Content-Disposition', `attachment; filename="inventory_${formatExportTimestamp()}.csv"`)
      return c.text(csv)
    } catch (error) {
      return handleExportFailure(c, 'Failed to export inventory', error)
    }
  })

  export_.get('/containers', authMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const studyCode = c.req.query('study')
      if (!studyCode) {
        return c.json({ error: 'Study parameter is required' }, 400)
      }

      const countOnly = c.req.query('count_only') === 'true'
      const formatParam = c.req.query('format') as ContainerExportFormat | undefined

      const result = await runSingleStudyContainerExportGet(database, {
        filters: buildGetFilters(c, studyCode),
        format: formatParam,
        columns: c.req.query('columns')
          ? parseColumnsParam(JSON.parse(c.req.query('columns') as string))
          : undefined,
        csvOptions: parseCSVExportOptions(c.req.query()),
        userId: user?.id,
        countOnly,
      })

      if (result.kind === 'count') {
        return c.json({ count: result.count })
      }

      if (result.kind === 'json') {
        c.header('Content-Type', 'application/json')
        c.header('Content-Disposition', `attachment; filename="${result.filename}"`)
        return c.json(result.json)
      }

      if (result.kind === 'csv') {
        c.header('Content-Type', 'text/csv')
        c.header('Content-Disposition', `attachment; filename="${result.filename}"`)
        return c.text(result.csv)
      }

      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      c.header('Content-Disposition', `attachment; filename="${result.filename}"`)
      return c.body(new Uint8Array(result.xlsx), 200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    } catch (error) {
      return handleExportFailure(c, 'Failed to export containers', error)
    }
  })

  export_.post('/containers', authMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const body = await c.req.json()
      if (!body.study) {
        return c.json({ error: 'Study parameter is required' }, 400)
      }

      const subjectNames = body.subject_names || []
      if (!Array.isArray(subjectNames) || subjectNames.length === 0) {
        return c.json({ error: 'subject_names array is required' }, 400)
      }

      const subjectDates =
        body.subject_dates && typeof body.subject_dates === 'object' ? body.subject_dates : undefined

      const result = await runSingleStudyContainerExportPost(database, {
        studyCode: body.study,
        subjectNames,
        filters: buildPostFilters(body),
        format: parseExportFormat(body.format),
        columns: parseColumnsParam(body.columns),
        csvOptions: parseCSVExportOptions(body),
        userId: user?.id,
        countOnly: body.count_only === true,
        subjectDates,
        dateTolerance: body.date_tolerance || 0,
      })

      if ('count' in result) {
        return c.json(result)
      }

      return c.json(result)
    } catch (error) {
      return handleExportFailure(c, 'Failed to export containers', error)
    }
  })

  export_.get('/available-types', authMiddleware, async (c) => {
    try {
      const studyCode = c.req.query('study')
      if (!studyCode) {
        return c.json({ error: 'Study parameter is required' }, 400)
      }

      const studyId = await resolveStudyByShortCode(database, studyCode)
      if (studyId === null) {
        throw new ExpectedNotFoundError('Study not found')
      }

      const selected = await selectContainers(database, { kind: 'study', studyId })
      if (selected.specimens.length === 0) {
        return c.json({ specimen_types: [], container_types: [] })
      }

      const specimenTypeIds = [...new Set(selected.specimens.map((row) => row.specimenTypeId))]
      const specimenTypes = await database
        .select({ id: specimenType.id, name: specimenType.name })
        .from(specimenType)
        .where(inArray(specimenType.id, specimenTypeIds))
        .orderBy(specimenType.id)

      const present = new Set(selected.containerTypes.values())
      const containerTypes = CONTAINER_TYPES.filter((type) => type !== 'unknown' && present.has(type))

      return c.json({
        specimen_types: specimenTypes,
        container_types: containerTypes,
      })
    } catch (error) {
      return handleExportFailure(c, 'Failed to fetch available types', error)
    }
  })

  export_.post('/containers/validate-studies', authMiddleware, async (c) => {
    try {
      const body = await c.req.json()
      const studyCodes = body.study_codes || []
      if (!Array.isArray(studyCodes) || studyCodes.length === 0) {
        return c.json({ error: 'study_codes array is required' }, 400)
      }
      return c.json(await runValidateStudyCodesExport(database, studyCodes))
    } catch (error) {
      return handleExportFailure(c, 'Failed to validate study codes', error)
    }
  })

  export_.post('/containers/multi-study', authMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const body = await c.req.json()
      const entries = body.entries || []
      if (!Array.isArray(entries) || entries.length === 0) {
        return c.json({ error: 'entries array is required' }, 400)
      }

      for (const entry of entries) {
        if (!entry.study_short_code || !entry.subject_name) {
          return c.json({ error: 'Each entry must have study_short_code and subject_name' }, 400)
        }
      }

      const result = await runMultiStudyContainerExportPost(database, {
        entries: entries as MultiStudyExportEntry[],
        filters: buildPostFilters(body),
        format: parseExportFormat(body.format),
        columns: parseColumnsParam(body.columns),
        csvOptions: parseCSVExportOptions(body),
        userId: user?.id,
        countOnly: body.count_only === true,
        dateTolerance: body.date_tolerance || 0,
      })

      return c.json(result)
    } catch (error) {
      return handleExportFailure(c, 'Failed to export containers', error)
    }
  })

  export_.post('/containers/by-barcodes', authMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const body = await c.req.json()
      const barcodes = body.barcodes || []
      if (!Array.isArray(barcodes) || barcodes.length === 0) {
        return c.json({ error: 'barcodes array is required and must not be empty' }, 400)
      }

      const result = await runBarcodeContainerExportPost(database, {
        barcodes,
        format: parseExportFormat(body.format),
        columns: parseColumnsParam(body.columns),
        csvOptions: parseCSVExportOptions(body),
        userId: user?.id,
      })

      return c.json(result)
    } catch (error) {
      return handleExportFailure(c, 'Failed to export containers', error)
    }
  })

  return export_
}
