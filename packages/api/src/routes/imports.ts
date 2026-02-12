import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { importDerivationsFromCsv, validateDerivationsCsv, type BulkDerivationSettings } from '../lib/derivations-csv'
import { runBulkCombinedImport, type ExtendedContainerData } from '../lib/bulk-combined-import'
import { validateBulkCombinedPayload } from '../lib/bulk-combined-validate'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { ValidationError } from '../lib/error-handler'
import { handleRouteError } from '../lib/error-handler'

/**
 * Create imports routes with database injection
 * @param database - Database instance (required)
 */
export function createImportsRoutes(database: Database): Hono {
  const imports = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

const bulkDerivationSettingsSchema = z.object({
  derivationType: z.string(),
  specimenTypeName: z.string(),
  containerType: z.enum(['micronix_tube', 'cryovial_tube', 'paper']),
  protocol: z.string(),
  derivationDate: z.string(),
  quantity: z.number().optional(),
  unitSymbol: z.string().optional(),
  quantityUsed: z.number().optional(),
  reduceParentQuantity: z.boolean().optional(),
  validateSourceSpecimenType: z.boolean().optional(),
  validateParentQuantity: z.boolean().optional(),
})

// Bulk import container derivations from CSV
// Expects JSON body: { csv: string, dryRun?: boolean, settings?: BulkDerivationSettings }
imports.post('/derivations-csv', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      csv: z.string().min(1),
      dryRun: z.boolean().optional(),
      settings: bulkDerivationSettingsSchema.optional(),
    })
    const data = schema.parse(body)

    const result = await importDerivationsFromCsv(database, data.csv, { 
      dryRun: data.dryRun,
      settings: data.settings,
    })
    return c.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error importing derivations CSV:', error)
    return c.json({ error: 'Failed to import derivations CSV', details: error.message }, 500)
  }
})

// Validate derivations CSV without importing
// Expects JSON body: { csv: string, settings?: BulkDerivationSettings }
imports.post('/derivations-csv/validate', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      csv: z.string().min(1),
      settings: bulkDerivationSettingsSchema.optional(),
    })
    const data = schema.parse(body)

    const result = await validateDerivationsCsv(database, data.csv, data.settings)
    return c.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error validating derivations CSV:', error)
    return c.json({ error: 'Failed to validate derivations CSV', details: error.message }, 500)
  }
})

const containerSchema = z.object({
  containerType: z.enum(['micronix_tube', 'cryovial_tube', 'paper', 'static_well']).optional(),
  collectionName: z.string().optional(),
  collectionBarcode: z.string().optional(),
  barcode: z.string().optional(),
  position: z.string().optional(),
  label: z.string().optional(),
  unitId: z.number().int().optional(),
  totalQuantity: z.number().optional(),
  remainingQuantity: z.number().optional(),
  comment: z.string().optional(),
  collectionLocationId: z.number().int().optional(),
}).optional()

// Bulk combined import (subjects + specimens + containers) with configurable atomicity
// Body: { studyShortCode, atomicMode: 'full_file' | 'per_subject', createCollections?: [...], subjects: [...] }
imports.post('/bulk-combined', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      studyShortCode: z.string().min(1),
      atomicMode: z.enum(['full_file', 'per_subject']),
      createCollections: z.array(z.object({
        type: z.enum(['box', 'bag', 'micronix_plate', 'cryovial_box']),
        name: z.string().min(1),
        locationId: z.number().int(),
        barcode: z.string().optional(),
      })).optional(),
      subjects: z.array(z.object({
        subjectName: z.string().min(1),
        specimens: z.array(z.object({
          specimenTypeName: z.string().min(1),
          collectionDate: z.string().optional(),
          container: containerSchema,
        })),
      })),
    })
    const data = schema.parse(body)
    if (data.subjects.length === 0) {
      return c.json({ error: 'No subjects provided' }, 400)
    }
    const user = c.get('user')
    const result = await runBulkCombinedImport(database, {
      studyShortCode: data.studyShortCode,
      atomicMode: data.atomicMode,
      createCollections: data.createCollections,
      subjects: data.subjects.map((s) => ({
        subjectName: s.subjectName,
        specimens: s.specimens.map((sp) => ({
          specimenTypeName: sp.specimenTypeName,
          collectionDate: sp.collectionDate,
          container: sp.container as ExtendedContainerData | undefined,
        })),
      })),
    }, user?.id)
    return c.json({
      summary: result.summary,
      results: result.results.map((r) => ({
        subject: r.subject,
        subjectCreated: r.subjectCreated,
        specimens: r.specimens.map((s) => ({
          ...s.specimen,
          containerCreated: s.containerCreated,
          containerId: s.containerId,
        })),
      })),
      errors: result.errors,
    }, 201)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400)
    }
    return handleRouteError(error, c)
  }
})

// Validate bulk-combined payload without importing (same body as POST /bulk-combined; specimens may include optional rowIndex)
imports.post('/bulk-combined/validate', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      studyShortCode: z.string().min(1),
      atomicMode: z.enum(['full_file', 'per_subject']),
      createCollections: z.array(z.object({
        type: z.enum(['box', 'bag', 'micronix_plate', 'cryovial_box']),
        name: z.string().min(1),
        locationId: z.number().int(),
        barcode: z.string().optional(),
      })).optional(),
      subjects: z.array(z.object({
        subjectName: z.string().min(1),
        specimens: z.array(z.object({
          specimenTypeName: z.string().min(1),
          collectionDate: z.string().optional(),
          container: containerSchema,
          rowIndex: z.number().int().optional(),
        })),
      })),
    })
    const data = schema.parse(body)
    if (data.subjects.length === 0) {
      return c.json({ error: 'No subjects provided' }, 400)
    }
    const result = await validateBulkCombinedPayload(database, {
      studyShortCode: data.studyShortCode,
      atomicMode: data.atomicMode,
      createCollections: data.createCollections,
      subjects: data.subjects.map((s) => ({
        subjectName: s.subjectName,
        specimens: s.specimens.map((sp) => ({
          specimenTypeName: sp.specimenTypeName,
          collectionDate: sp.collectionDate,
          container: sp.container as ExtendedContainerData | undefined,
          rowIndex: sp.rowIndex,
        })),
      })),
    })
    return c.json(result)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return handleRouteError(error, c)
  }
})

  return imports
}


