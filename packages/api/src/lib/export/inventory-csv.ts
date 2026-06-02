import type { Database } from '../../db/client'
import { specimen } from '../../db/schema'
import { formatSimpleCSV } from './format'
import type { CSVExportOptions } from './types'

export async function exportInventoryCsv(
  database: Database,
  csvOptions: CSVExportOptions
): Promise<string> {
  const allSpecimens = await database
    .select({
      studySubjectId: specimen.studySubjectId,
      controlBatchId: specimen.controlBatchId,
    })
    .from(specimen)

  const counts: Record<string, number> = {
    subject: 0,
    control: 0,
    unknown: 0,
  }

  for (const spec of allSpecimens) {
    if (spec.studySubjectId) {
      counts.subject++
    } else if (spec.controlBatchId) {
      counts.control++
    } else {
      counts.unknown++
    }
  }

  const headers = ['source_type', 'count']
  const rows = Object.entries(counts).map(([type, count]) => [type, count])
  return formatSimpleCSV(headers, rows, csvOptions)
}
