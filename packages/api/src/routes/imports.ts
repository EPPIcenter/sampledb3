import { Hono } from 'hono'
import { z } from 'zod'
import { importDerivationsFromCsv } from '../lib/derivations-csv'

const imports = new Hono()

// Bulk import container derivations from CSV
// Expects JSON body: { csv: string, dryRun?: boolean }
imports.post('/imports/derivations-csv', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      csv: z.string().min(1),
      dryRun: z.boolean().optional(),
    })
    const data = schema.parse(body)

    const result = await importDerivationsFromCsv(data.csv, { dryRun: data.dryRun })
    return c.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error importing derivations CSV:', error)
    return c.json({ error: 'Failed to import derivations CSV', details: error.message }, 500)
  }
})

export default imports


