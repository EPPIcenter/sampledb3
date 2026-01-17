import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { importDerivationsFromCsv, validateDerivationsCsv, type BulkDerivationSettings } from '../lib/derivations-csv'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'

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

  return imports
}


