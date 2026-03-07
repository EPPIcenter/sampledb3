import { buildCsv } from './csv'

const COLUMNS = ['source_collection_name', 'source_position', 'target_position'] as const

/**
 * Generate CSV template content for cryovial container move (source box/position → target position).
 */
export function generateCryovialMoveTemplate(): string {
  const rows: (string | number | null)[][] = [
    ['BOX-001', 'B05', 'C03'],
    ['BOX-001', 'C02', 'D01'],
    ['BOX-002', 'A01', 'B02'],
  ]
  return buildCsv([...COLUMNS], rows)
}
