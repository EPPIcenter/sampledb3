import { Hono } from 'hono'
import type { Database } from '../db/client'
import {
  qpcrExperiment,
  qpcrExperimentWell,
  qpcrRun,
  qpcrWellResult,
  qpcrAmplificationData,
  specimen,
  studySubject,
  study,
  controlBatch,
  controlDefinition,
  storageContainer,
} from '../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { parseBioradCsv, parseQuantStudioXls } from '../lib/qpcr-result-parse'
import { z } from 'zod'
import { handleRouteError } from '../lib/error-handler'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { getScannerConfigurationById } from '../lib/settings'
import type { ScannerConfiguration } from '../lib/settings'
import { resolveMicronixBarcodesToContainers } from '../lib/export-helpers'

type WellSource =
  | { type: 'subject'; id: number; name: string; study: { id: number; title: string; code: string } }
  | { type: 'control'; id: number; name: string; definitionName: string | null; controlType: string }
  | null

/**
 * Enrich a well with source (subject vs control) when specimen_id is set
 */
async function enrichWellSource(
  database: Database,
  specimenId: number | null
): Promise<WellSource> {
  if (specimenId == null) return null
  const spec = await database.select().from(specimen).where(eq(specimen.id, specimenId)).get()
  if (!spec) return null
  if (spec.studySubjectId != null) {
    const subj = await database
      .select({
        id: studySubject.id,
        name: studySubject.name,
        studyId: studySubject.studyId,
        studyTitle: study.title,
        studyCode: study.shortCode,
      })
      .from(studySubject)
      .leftJoin(study, eq(studySubject.studyId, study.id))
      .where(eq(studySubject.id, spec.studySubjectId))
      .get()
    if (subj && subj.studyTitle != null && subj.studyCode != null) {
      return {
        type: 'subject',
        id: subj.id,
        name: subj.name,
        study: { id: subj.studyId, title: subj.studyTitle, code: subj.studyCode },
      }
    }
  }
  if (spec.controlBatchId != null) {
    const batch = await database
      .select({
        id: controlBatch.id,
        name: controlBatch.name,
        definitionName: controlDefinition.name,
        controlType: controlDefinition.controlType,
      })
      .from(controlBatch)
      .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
      .where(eq(controlBatch.id, spec.controlBatchId))
      .get()
    if (batch && batch.definitionName != null && batch.controlType != null) {
      return {
        type: 'control',
        id: batch.id,
        name: batch.name,
        definitionName: batch.definitionName,
        controlType: batch.controlType,
      }
    }
  }
  return null
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = 12

/** Normalize well position to A01 style (row + 2-digit column) */
function normalizeWellPosition(pos: string): string {
  const t = pos.trim()
  if (!t) return t
  const match = t.match(/^([A-H])(\d{1,2})$/i)
  if (match) {
    const row = match[1].toUpperCase()
    const col = parseInt(match[2], 10)
    return `${row}${col.toString().padStart(2, '0')}`
  }
  return t
}

/**
 * Parse plate CSV with scanner config; returns rows with well_position and barcode.
 * Skips empty barcode rows (empty wells).
 */
function parsePlateCSV(
  csvText: string,
  config: ScannerConfiguration
): { wellPosition: string; barcode: string }[] {
  const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length <= config.skipRows) return []
  const headerLine = lines[config.skipRows]
  const headers = headerLine.split(',').map((h) => h.trim())
  const rows: { wellPosition: string; barcode: string }[] = []
  for (let i = config.skipRows + 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = values[j] ?? ''
    })
    const barcode = (row[config.barcodeColumn] ?? '').trim()
    let wellPosition: string
    if (config.positionType === 'single') {
      wellPosition = (row[config.positionColumn ?? ''] ?? '').trim()
    } else {
      const rowVal = (row[config.rowColumn ?? ''] ?? '').trim()
      const colVal = (row[config.columnColumn ?? ''] ?? '').trim()
      wellPosition = `${rowVal}${colVal.padStart(2, '0')}`
    }
    wellPosition = normalizeWellPosition(wellPosition)
    if (!wellPosition) continue
    rows.push({ wellPosition, barcode })
  }
  return rows
}

export function createQpcrExperimentsRoutes(database: Database): Hono {
  const qpcr = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

  const createSchema = z.object({
    name: z.string().optional().nullable(),
    templateFormat: z.enum(['biorad', 'quant_studio']),
    standardLayout: z.record(z.string(), z.unknown()).optional().nullable(),
  })

  const updateSchema = z.object({
    name: z.string().optional().nullable(),
    standardLayout: z.record(z.string(), z.unknown()).optional().nullable(),
    status: z.enum(['setup', 'template_exported', 'results_uploaded']).optional(),
    targetName: z.string().optional().nullable(),
    fluorophore: z.string().optional().nullable(),
    reporter: z.string().optional().nullable(),
    instrumentType: z.string().optional().nullable(),
  })

  // GET / - List experiments
  qpcr.get('/', authMiddleware, async (c) => {
    try {
      const statusFilter = c.req.query('status')
      const experiments = statusFilter
        ? await database
            .select()
            .from(qpcrExperiment)
            .where(eq(qpcrExperiment.status, statusFilter))
            .orderBy(qpcrExperiment.id)
        : await database.select().from(qpcrExperiment).orderBy(qpcrExperiment.id)
      return c.json({ experiments })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // POST / - Create experiment
  qpcr.post('/', authMiddleware, memberMiddleware, async (c) => {
    try {
      const body = await c.req.json()
      const data = createSchema.parse(body)
      const user = c.get('user') as { id: number } | undefined
      const now = new Date().toISOString()
      const [inserted] = await database
        .insert(qpcrExperiment)
        .values({
          name: data.name ?? null,
          templateFormat: data.templateFormat,
          status: 'setup',
          standardLayout: data.standardLayout ?? null,
          created: now,
          lastUpdated: now,
          createdBy: user?.id ?? null,
          updatedBy: user?.id ?? null,
        })
        .returning()
      if (!inserted) throw new Error('Insert failed')
      return c.json(inserted, 201)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Validation error', details: error.issues, errorCode: 'VALIDATION_ERROR' }, 400)
      }
      return handleRouteError(error, c)
    }
  })

  // GET /:id - Detail with wells and resolved source
  qpcr.get('/:id', authMiddleware, async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
      const exp = await database.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, id)).get()
      if (!exp) return c.json({ error: 'Not found' }, 404)
      const wells = await database
        .select()
        .from(qpcrExperimentWell)
        .where(eq(qpcrExperimentWell.qpcrExperimentId, id))
      const wellsWithSource = await Promise.all(
        wells.map(async (w) => {
          const source = await enrichWellSource(database, w.specimenId)
          return { ...w, source }
        })
      )
      return c.json({ experiment: exp, wells: wellsWithSource })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // DELETE /:id - Delete experiment and all related data (wells, runs, well results, amplification data)
  qpcr.delete('/:id', authMiddleware, memberMiddleware, async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
      const exp = await database.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, id)).get()
      if (!exp) return c.json({ error: 'Not found' }, 404)

      const runs = await database
        .select({ id: qpcrRun.id })
        .from(qpcrRun)
        .where(eq(qpcrRun.qpcrExperimentId, id))
      const runIds = runs.map((r) => r.id)
      if (runIds.length > 0) {
        const wellResults = await database
          .select({ id: qpcrWellResult.id })
          .from(qpcrWellResult)
          .where(inArray(qpcrWellResult.qpcrRunId, runIds))
        const wellResultIds = wellResults.map((w) => w.id)
        if (wellResultIds.length > 0) {
          await database
            .delete(qpcrAmplificationData)
            .where(inArray(qpcrAmplificationData.qpcrWellResultId, wellResultIds))
        }
        await database.delete(qpcrWellResult).where(inArray(qpcrWellResult.qpcrRunId, runIds))
      }
      await database.delete(qpcrRun).where(eq(qpcrRun.qpcrExperimentId, id))
      await database.delete(qpcrExperimentWell).where(eq(qpcrExperimentWell.qpcrExperimentId, id))
      await database.delete(qpcrExperiment).where(eq(qpcrExperiment.id, id))

      return c.body(null, 204)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // PATCH /:id - Update experiment
  qpcr.patch('/:id', authMiddleware, memberMiddleware, async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
      const body = await c.req.json()
      const data = updateSchema.parse(body)
      const exp = await database.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, id)).get()
      if (!exp) return c.json({ error: 'Not found' }, 404)
      const user = c.get('user') as { id: number } | undefined
      const updates: Partial<typeof qpcrExperiment.$inferInsert> = {
        lastUpdated: new Date().toISOString(),
        updatedBy: user?.id ?? null,
      }
      if (data.name !== undefined) updates.name = data.name
      if (data.standardLayout !== undefined) updates.standardLayout = data.standardLayout
      if (data.status !== undefined) updates.status = data.status
      if (data.targetName !== undefined) updates.targetName = data.targetName
      if (data.fluorophore !== undefined) updates.fluorophore = data.fluorophore
      if (data.reporter !== undefined) updates.reporter = data.reporter
      if (data.instrumentType !== undefined) updates.instrumentType = data.instrumentType
      const [updated] = await database
        .update(qpcrExperiment)
        .set(updates)
        .where(eq(qpcrExperiment.id, id))
        .returning()
      return c.json(updated ?? exp)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Validation error', details: error.issues, errorCode: 'VALIDATION_ERROR' }, 400)
      }
      return handleRouteError(error, c)
    }
  })

  const plateUploadSchema = z.object({
    csvText: z.string(),
    scannerConfigurationId: z.string(),
    plateBarcode: z.string().optional().nullable(),
  })

  // POST /:id/plate - Upload plate layout (CSV with barcode + position); resolve barcodes, upsert wells
  qpcr.post('/:id/plate', authMiddleware, memberMiddleware, async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
      const body = await c.req.json()
      const data = plateUploadSchema.parse(body)
      const exp = await database.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, id)).get()
      if (!exp) return c.json({ error: 'Not found' }, 404)
      if (exp.status !== 'setup') {
        return c.json(
          {
            error:
              'Plate layout cannot be changed after template has been exported or results have been uploaded. Delete the experiment to start over.',
            errorCode: 'PLATE_LOCKED',
          },
          409
        )
      }

      const config = await getScannerConfigurationById(database, data.scannerConfigurationId)
      if (!config) return c.json({ error: 'Scanner configuration not found' }, 400)

      const rows = parsePlateCSV(data.csvText, config)
      const barcodes = [...new Set(rows.map((r) => r.barcode).filter((b) => b.length > 0))]
      const barcodeToContainerId = await resolveMicronixBarcodesToContainers(database, barcodes)

      const unresolved: { wellPosition: string; barcode: string }[] = []
      for (const r of rows) {
        if (r.barcode && !barcodeToContainerId.has(r.barcode)) {
          unresolved.push({ wellPosition: r.wellPosition, barcode: r.barcode })
        }
      }

      const containerIds = [...barcodeToContainerId.values()]
      const containerToSpecimen = new Map<number, number>()
      const containerToStorage = new Map<number, { specimenId: number | null }>()
      if (containerIds.length > 0) {
        const containers = await database
          .select({ id: storageContainer.id, specimenId: storageContainer.specimenId })
          .from(storageContainer)
          .where(inArray(storageContainer.id, containerIds))
        for (const row of containers) {
          containerToStorage.set(row.id, { specimenId: row.specimenId })
          if (row.specimenId != null) containerToSpecimen.set(row.id, row.specimenId)
        }
      }

      const specimenIds = [...containerToSpecimen.values()]
      const specimenToContent = new Map<number, { contentType: string; standardDensity: number | null }>()
      if (specimenIds.length > 0) {
        const specimens = await database
          .select({ id: specimen.id, controlBatchId: specimen.controlBatchId })
          .from(specimen)
          .where(inArray(specimen.id, specimenIds))
        const batchIds = [...new Set(specimens.map((s) => s.controlBatchId).filter((id): id is number => id != null))]
        const definitionsByBatch = new Map<number, { targetDensity: number | null }>()
        if (batchIds.length > 0) {
          const batches = await database
            .select({
              id: controlBatch.id,
              controlDefinitionId: controlBatch.controlDefinitionId,
            })
            .from(controlBatch)
            .where(inArray(controlBatch.id, batchIds))
          const defIds = [...new Set(batches.map((b) => b.controlDefinitionId))]
          const defs = await database
            .select({ id: controlDefinition.id, properties: controlDefinition.properties })
            .from(controlDefinition)
            .where(inArray(controlDefinition.id, defIds))
          for (const b of batches) {
            const def = defs.find((d) => d.id === b.controlDefinitionId)
            if (def) {
              const props = def.properties as { targetDensity?: number } | null
              const targetDensity = props?.targetDensity != null ? Number(props.targetDensity) : null
              definitionsByBatch.set(b.id, { targetDensity })
            }
          }
        }
        for (const s of specimens) {
          if (s.controlBatchId != null) {
            const def = definitionsByBatch.get(s.controlBatchId)
            const targetDensity = def?.targetDensity ?? null
            const contentType = targetDensity !== null && targetDensity === 0 ? 'negative' : 'standard'
            specimenToContent.set(s.id, { contentType, standardDensity: targetDensity })
          } else {
            specimenToContent.set(s.id, { contentType: 'unknown', standardDensity: null })
          }
        }
      }

      const wellsToInsert: Array<{
        qpcrExperimentId: number
        wellPosition: string
        barcode: string | null
        storageContainerId: number | null
        specimenId: number | null
        contentType: string | null
        standardDensity: number | null
      }> = []
      const seenPositions = new Set<string>()
      for (const r of rows) {
        if (seenPositions.has(r.wellPosition)) continue
        seenPositions.add(r.wellPosition)
        if (!r.barcode?.trim()) {
          continue
        }
        const containerId = barcodeToContainerId.get(r.barcode)
        if (!containerId) continue
        const storage = containerToStorage.get(containerId)
        const specimenId = storage?.specimenId ?? null
        const content = specimenId != null ? specimenToContent.get(specimenId) : null
        wellsToInsert.push({
          qpcrExperimentId: id,
          wellPosition: r.wellPosition,
          barcode: r.barcode,
          storageContainerId: containerId,
          specimenId,
          contentType: content?.contentType ?? null,
          standardDensity: content?.standardDensity ?? null,
        })
      }

      const now = new Date().toISOString()
      await database.delete(qpcrExperimentWell).where(eq(qpcrExperimentWell.qpcrExperimentId, id))
      if (wellsToInsert.length > 0) {
        await database.insert(qpcrExperimentWell).values(
          wellsToInsert.map((w) => ({
            qpcrExperimentId: w.qpcrExperimentId,
            wellPosition: w.wellPosition,
            barcode: w.barcode,
            storageContainerId: w.storageContainerId,
            specimenId: w.specimenId,
            contentType: w.contentType,
            standardDensity: w.standardDensity,
          }))
        )
      }
      if (data.plateBarcode !== undefined && data.plateBarcode !== null) {
        await database
          .update(qpcrExperiment)
          .set({ plateBarcode: data.plateBarcode, lastUpdated: now, updatedBy: (c.get('user') as { id: number } | undefined)?.id ?? null })
          .where(eq(qpcrExperiment.id, id))
      }

      const inserted = await database
        .select()
        .from(qpcrExperimentWell)
        .where(eq(qpcrExperimentWell.qpcrExperimentId, id))
      return c.json({ wells: inserted, unresolved }, 200)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Validation error', details: error.issues, errorCode: 'VALIDATION_ERROR' }, 400)
      }
      return handleRouteError(error, c)
    }
  })

  const resultsUploadSchema = z.object({
    fileContent: z.string(), // base64
    fileName: z.string(),
    instrumentType: z.enum(['Biorad_CFX', 'QuantStudio']),
  })

  // POST /:id/results - Upload result file (Biorad CSV or QuantStudio XLS)
  qpcr.post('/:id/results', authMiddleware, memberMiddleware, async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
      const body = await c.req.json()
      const data = resultsUploadSchema.parse(body)
      const exp = await database.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, id)).get()
      if (!exp) return c.json({ error: 'Not found' }, 404)

      let parseResult: Awaited<ReturnType<typeof parseQuantStudioXls>>
      const buffer = Buffer.from(data.fileContent, 'base64')
      if (data.instrumentType === 'Biorad_CFX') {
        parseResult = parseBioradCsv(buffer.toString('utf-8'), data.fileName)
      } else {
        parseResult = await parseQuantStudioXls(buffer, data.fileName)
      }

      const now = new Date().toISOString()
      const [runRow] = await database
        .insert(qpcrRun)
        .values({
          qpcrExperimentId: id,
          instrumentType: data.instrumentType,
          runStartedAt: parseResult.runMetadata.runStartedAt,
          runEndedAt: parseResult.runMetadata.runEndedAt,
          experimentName: parseResult.runMetadata.experimentName,
          fileName: parseResult.runMetadata.fileName,
          created: now,
          slope: parseResult.runMetadata.slope ?? null,
          yIntercept: parseResult.runMetadata.yIntercept ?? null,
          rSquared: parseResult.runMetadata.rSquared ?? null,
          efficiency: parseResult.runMetadata.efficiency ?? null,
        })
        .returning()
      if (!runRow) return c.json({ error: 'Failed to create run' }, 500)
      const runId = runRow.id

      const wellResultKeys = new Map<string, number>()
      const deduped = new Map<string, (typeof parseResult.wellResults)[0]>()
      for (const row of parseResult.wellResults) {
        const key = `${row.wellPosition}\t${row.targetName ?? ''}`
        deduped.set(key, row)
      }
      for (const row of deduped.values()) {
        const targetKey = row.targetName ?? ''
        const [inserted] = await database
          .insert(qpcrWellResult)
          .values({
            qpcrRunId: runId,
            wellPosition: row.wellPosition,
            targetName: row.targetName ?? null,
            sampleBarcode: row.sampleBarcode ?? null,
            task: row.task ?? null,
            cq: row.cq ?? null,
            quantity: row.quantity ?? null,
            standardQuantity: row.standardQuantity ?? null,
            ampStatus: row.ampStatus ?? null,
          })
          .returning()
        if (inserted) {
          wellResultKeys.set(`${row.wellPosition}\t${targetKey}`, inserted.id)
        }
      }

      if (parseResult.amplificationData.length > 0) {
        const ampRows: Array<{ qpcrWellResultId: number; cycle: number; rn: number | null; deltaRn: number | null }> = []
        for (const row of parseResult.amplificationData) {
          const key = `${row.wellPosition}\t${row.targetName ?? ''}`
          const wellResultId = wellResultKeys.get(key)
          if (wellResultId != null) {
            ampRows.push({
              qpcrWellResultId: wellResultId,
              cycle: row.cycle,
              rn: row.rn ?? null,
              deltaRn: row.deltaRn ?? null,
            })
          }
        }
        if (ampRows.length > 0) {
          await database.insert(qpcrAmplificationData).values(ampRows)
        }
      }

      await database
        .update(qpcrExperiment)
        .set({ status: 'results_uploaded', lastUpdated: now, updatedBy: (c.get('user') as { id: number } | undefined)?.id ?? null })
        .where(eq(qpcrExperiment.id, id))

      return c.json({ run: runRow, wellResultCount: parseResult.wellResults.length, amplificationCount: parseResult.amplificationData.length }, 201)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Validation error', details: error.issues, errorCode: 'VALIDATION_ERROR' }, 400)
      }
      return handleRouteError(error, c)
    }
  })

  /** Sample name for template: subject name for study samples, label for controls */
  function sampleNameForWell(
    well: { contentType: string | null; standardDensity: number | null; barcode: string | null },
    source: WellSource | null
  ): string {
    if (source?.type === 'subject') return source.name
    if (!well.barcode && well.contentType !== 'standard' && well.contentType !== 'negative') return ''
    if (well.contentType === 'negative' || (well.standardDensity !== null && well.standardDensity === 0)) return 'Neg ctrl'
    if (well.standardDensity != null) {
      if (well.standardDensity >= 10000) return 'Std-10k'
      if (well.standardDensity >= 1000) return 'Std-1k'
      if (well.standardDensity >= 100) return 'Std-100'
      if (well.standardDensity >= 10) return 'Std-10'
      if (well.standardDensity >= 1) return 'Std-1'
    }
    return well.barcode ?? ''
  }

  /** Bio-Rad CFX Maestro Content: Unk, Std, NTC, Pos, Neg */
  function bioradContentForWell(well: { contentType: string | null; standardDensity: number | null }): string {
    if (well.contentType === 'negative' || (well.standardDensity !== null && well.standardDensity === 0)) return 'NTC'
    if (well.contentType === 'standard') return 'Std'
    return 'Unk'
  }

  /** QuantStudio Task: UNKNOWN, STANDARD, NTC, PC */
  function quantStudioTaskForWell(well: { contentType: string | null; standardDensity: number | null }): string {
    if (well.contentType === 'negative' || (well.standardDensity !== null && well.standardDensity === 0)) return 'NTC'
    if (well.contentType === 'standard') return 'STANDARD'
    return 'UNKNOWN'
  }

  function wellPositionToIndex(pos: string): number {
    const match = pos.match(/^([A-H])(\d{1,2})$/i)
    if (!match) return 0
    const rowIdx = ROWS.indexOf(match[1].toUpperCase())
    const col = parseInt(match[2], 10)
    return rowIdx * COLS + col
  }

  function wellPositionToA1(pos: string): string {
    const match = pos.match(/^([A-H])(\d{1,2})$/i)
    if (!match) return pos
    return `${match[1].toUpperCase()}${parseInt(match[2], 10)}`
  }

  // GET /:id/template?format=biorad|quant_studio&fluorophore=FAM&targetName=varATS&reporter=FAM&instrumentType=...
  // Bio-Rad uses Fluorophore only; QuantStudio uses Reporter + Quencher (Quencher inferred from Reporter: SYBR→None, else NFQ-MGB). See design/qpcr-fluorophore-reporter.md.
  qpcr.get('/:id/template', authMiddleware, async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
      const format = c.req.query('format') as 'biorad' | 'quant_studio' | undefined
      if (!format || (format !== 'biorad' && format !== 'quant_studio')) {
        return c.json({ error: 'Query parameter format must be biorad or quant_studio' }, 400)
      }
      const exp = await database.select().from(qpcrExperiment).where(eq(qpcrExperiment.id, id)).get()
      if (!exp) return c.json({ error: 'Not found' }, 404)
      const wells = await database
        .select()
        .from(qpcrExperimentWell)
        .where(eq(qpcrExperimentWell.qpcrExperimentId, id))
      const wellsWithSource = await Promise.all(
        wells.map(async (w) => {
          const source = await enrichWellSource(database, w.specimenId)
          return { well: w, source }
        })
      )
      const wellMap = new Map<string, { well: typeof wells[0]; source: WellSource }>()
      wellsWithSource.forEach(({ well, source }) => wellMap.set(well.wellPosition, { well, source }))

      const targetName = (c.req.query('targetName') as string | undefined) ?? exp.targetName ?? 'varATS'
      const fluorophore = (c.req.query('fluorophore') as string | undefined) ?? exp.fluorophore ?? 'FAM'
      const reporter = (c.req.query('reporter') as string | undefined) ?? exp.reporter ?? 'FAM'
      // QuantStudio requires Quencher; infer from Reporter (SYBR → None, others → NFQ-MGB). See design/qpcr-fluorophore-reporter.md.
      const quencher = (() => {
        const r = (reporter ?? '').trim()
        if (r.toLowerCase() === 'sybr') return 'None'
        return 'NFQ-MGB'
      })()
      const instrumentType = (c.req.query('instrumentType') as string | undefined) ?? exp.instrumentType ?? 'QuantStudio 5 Real-Time PCR System'

      if (format === 'biorad') {
        const header = 'Well,Fluorophore,Target Name,Content,Sample Name,Quantity'
        const lines: string[] = [header]
        for (const row of ROWS) {
          for (let col = 1; col <= COLS; col++) {
            const pos = `${row}${col.toString().padStart(2, '0')}`
            const entry = wellMap.get(pos)
            const well = entry?.well
            if (!well) continue
            const source = entry?.source ?? null
            const sampleName = sampleNameForWell(well, source)
            const content = bioradContentForWell(well)
            const quantity = well.contentType === 'standard' && well.standardDensity != null ? String(well.standardDensity) : ''
            const wellA1 = wellPositionToA1(pos)
            lines.push(`${wellA1},${fluorophore},${targetName},${content},${sampleName},${quantity}`)
          }
        }
        const csv = lines.join('\n')
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="qpcr-experiment-${id}-biorad-template.csv"`,
          },
        })
      }

      const meta = [
        '* Block Type = 96-Well',
        '* Experiment Type = Standard Curve',
        `* Instrument Type = ${instrumentType}`,
        '* No. Of Wells = 96',
        '* Set Up Well Section Info =',
      ]
      const dataHeader = 'Well\tWell Position\tSample Name\tTarget Name\tTask\tReporter\tQuencher\tQuantity'
      const dataLines: string[] = [dataHeader]
      for (const row of ROWS) {
        for (let col = 1; col <= COLS; col++) {
          const pos = `${row}${col.toString().padStart(2, '0')}`
          const entry = wellMap.get(pos)
          const well = entry?.well
          if (!well) continue
          const source = entry?.source ?? null
          const sampleName = sampleNameForWell(well, source)
          const task = quantStudioTaskForWell(well)
          const quantity = well.contentType === 'standard' && well.standardDensity != null ? String(well.standardDensity) : ''
          const wellIdx = wellPositionToIndex(pos)
          const wellPos = wellPositionToA1(pos)
          dataLines.push(`${wellIdx}\t${wellPos}\t${sampleName}\t${targetName}\t${task}\t${reporter}\t${quencher}\t${quantity}`)
        }
      }
      const tsv = [...meta, '', dataLines.join('\n')].join('\n')
      return new Response(tsv, {
        status: 200,
        headers: {
          'Content-Type': 'text/tab-separated-values; charset=utf-8',
          'Content-Disposition': `attachment; filename="qpcr-experiment-${id}-quantstudio-template.txt"`,
        },
      })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  return qpcr
}
