import { describe, it, expect } from 'vitest'
import { generateCryovialMoveTemplate } from '../cryovial-move-template'

describe('generateCryovialMoveTemplate', () => {
  it('returns CSV with header and three example rows', () => {
    const csv = generateCryovialMoveTemplate()
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('source_collection_name,source_position,target_position')
    expect(lines[1]).toContain('BOX-001')
    expect(lines[1]).toContain('B05')
    expect(lines[1]).toContain('C03')
    expect(lines[2]).toContain('BOX-001')
    expect(lines[2]).toContain('C02')
    expect(lines[2]).toContain('D01')
    expect(lines[3]).toContain('BOX-002')
    expect(lines[3]).toContain('A01')
    expect(lines[3]).toContain('B02')
  })

  it('matches exact current template output for parser compatibility', () => {
    const csv = generateCryovialMoveTemplate()
    const expected =
      'source_collection_name,source_position,target_position\nBOX-001,B05,C03\nBOX-001,C02,D01\nBOX-002,A01,B02'
    expect(csv).toBe(expected)
  })
})
