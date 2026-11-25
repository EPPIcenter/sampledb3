import { inArray } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { micronixTube } from '../../db/schema'
import { chunkArray, SQL_IN_CHUNK_SIZE } from '../sql-helpers'

/**
 * Resolve micronix barcodes to container IDs, a chunk at a time so no IN list grows with
 * the upload. Only queries micronix_tube table (barcodes are globally unique)
 */
export async function resolveMicronixBarcodesToContainers(
  database: Database,
  barcodes: string[]
): Promise<Map<string, number>> {
  const uniqueBarcodes = [...new Set(barcodes.filter(b => b && b.trim()))]
  if (uniqueBarcodes.length === 0) return new Map()

  const result = new Map<string, number>()
  for (const chunk of chunkArray(uniqueBarcodes, SQL_IN_CHUNK_SIZE)) {
    const micronixTubes = await database
      .select({ id: micronixTube.id, barcode: micronixTube.barcode })
      .from(micronixTube)
      .where(inArray(micronixTube.barcode, chunk))
    for (const tube of micronixTubes) {
      if (tube.barcode) {
        result.set(tube.barcode, tube.id)
      }
    }
  }

  return result
}
