/**
 * User-facing summary of a qPCR result upload: what was stored, and the amplification rows the
 * upload skipped because their well has no row in the file's results section (empty wells).
 */
import type { QpcrResultsUploadResponse } from './api/qpcr'

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

export function qpcrResultsUploadMessage(result: QpcrResultsUploadResponse): string {
  const stored = `Imported ${plural(result.wellResultCount, 'well result', 'well results')} and ${plural(result.amplificationCount, 'amplification row', 'amplification rows')}.`
  const { rowCount, wellPositions } = result.skippedAmplification
  if (rowCount === 0) return stored
  return `${stored} Skipped ${plural(rowCount, 'amplification row', 'amplification rows')} from ${plural(wellPositions.length, 'well', 'wells')} with no result in the file (empty wells): ${wellPositions.join(', ')}.`
}
