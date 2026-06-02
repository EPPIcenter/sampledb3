import { describe, it, expect } from 'vitest'
import { parseCsv } from '@sampledb/contract'
import { generateCryovialMoveTemplate } from '../cryovial-move-template'

describe('generateCryovialMoveTemplate', () => {
  it('returns CSV with header and three example rows', () => {
    const csv = generateCryovialMoveTemplate()
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual(['source_collection_name', 'source_position', 'target_position'])
    expect(rows[1]).toEqual(['BOX-001', 'B05', 'C03'])
    expect(rows[2]).toEqual(['BOX-001', 'C02', 'D01'])
    expect(rows[3]).toEqual(['BOX-002', 'A01', 'B02'])
  })

  it('uses canonical CSV wire format with unchanged cell values', () => {
    const csv = generateCryovialMoveTemplate()
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(parseCsv(csv)).toEqual([
      ['source_collection_name', 'source_position', 'target_position'],
      ['BOX-001', 'B05', 'C03'],
      ['BOX-001', 'C02', 'D01'],
      ['BOX-002', 'A01', 'B02'],
    ])
  })
})
