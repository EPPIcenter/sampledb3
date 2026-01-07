import { Hono } from 'hono'
import { z } from 'zod'
import { importDerivationsFromCsv, validateDerivationsCsv, type BulkDerivationSettings } from '../lib/derivations-csv'

const imports = new Hono()

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
imports.post('/imports/derivations-csv', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      csv: z.string().min(1),
      dryRun: z.boolean().optional(),
      settings: bulkDerivationSettingsSchema.optional(),
    })
    const data = schema.parse(body)

    const result = await importDerivationsFromCsv(data.csv, { 
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
imports.post('/imports/derivations-csv/validate', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      csv: z.string().min(1),
      settings: bulkDerivationSettingsSchema.optional(),
    })
    const data = schema.parse(body)

    const result = await validateDerivationsCsv(data.csv, data.settings)
    return c.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error validating derivations CSV:', error)
    return c.json({ error: 'Failed to validate derivations CSV', details: error.message }, 500)
  }
})

export default imports


