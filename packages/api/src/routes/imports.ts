import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { importDerivationsFromCsv, validateDerivationsCsv, type BulkDerivationSettings } from '../lib/derivations-csv'
import { runBulkCombinedImport, type BulkCombinedContainerInput } from '../lib/bulk-combined-import'
import { validateBulkCombinedPayload } from '../lib/bulk-combined-validate'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { handleRouteError } from '../lib/error-handler'
import {
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
} from '@sampledb/contract'

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
  } catch (error) {
    return handleRouteError(error, c)
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
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Bulk combined import (subjects + specimens + containers) with configurable atomicity
// Body: { studyShortCode, atomicMode: 'full_file' | 'per_subject', subjects: [...] }
imports.post('/bulk-combined', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const data = bulkCombinedRequestSchema.parse(body)
    if (data.subjects.length === 0) {
      return c.json({ error: 'No subjects provided' }, 400)
    }
    const user = c.get('user')
    const result = await runBulkCombinedImport(database, {
      studyShortCode: data.studyShortCode,
      atomicMode: data.atomicMode,
      subjects: data.subjects.map((s) => ({
        subjectName: s.subjectName,
        specimens: s.specimens.map((sp) => ({
          specimenTypeName: sp.specimenTypeName,
          collectionDate: sp.collectionDate,
          container: sp.container as BulkCombinedContainerInput | undefined,
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
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Validate bulk-combined payload without importing (same body as POST /bulk-combined; specimens may include optional rowIndex)
imports.post('/bulk-combined/validate', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const data = bulkCombinedValidateRequestSchema.parse(body)
    if (data.subjects.length === 0) {
      return c.json({ error: 'No subjects provided' }, 400)
    }
    const result = await validateBulkCombinedPayload(database, {
      studyShortCode: data.studyShortCode,
      atomicMode: data.atomicMode,
      subjects: data.subjects.map((s) => ({
        subjectName: s.subjectName,
        specimens: s.specimens.map((sp) => ({
          specimenTypeName: sp.specimenTypeName,
          collectionDate: sp.collectionDate,
          container: sp.container as BulkCombinedContainerInput | undefined,
          rowIndex: sp.rowIndex,
        })),
      })),
    })
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return imports
}


