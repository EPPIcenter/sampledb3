import { describe, expect, it } from 'bun:test'
import { gridPositionRange, parseGridPosition, type GridCollectionType } from '../grid-position'

describe('parseGridPosition', () => {
  const normalized: Array<{ raw: string; type: GridCollectionType; expected: string }> = [
    { raw: 'A1', type: 'micronix_plate', expected: 'A01' },
    { raw: 'a1', type: 'micronix_plate', expected: 'A01' },
    { raw: 'a01', type: 'micronix_plate', expected: 'A01' },
    { raw: ' b7 ', type: 'micronix_plate', expected: 'B07' },
    { raw: 'H12', type: 'micronix_plate', expected: 'H12' },
    { raw: 'J10', type: 'cryovial_box', expected: 'J10' },
    { raw: 'i9', type: 'cryovial_box', expected: 'I09' },
  ]
  for (const { raw, type, expected } of normalized) {
    it(`stores "${raw}" on a ${type} as ${expected}`, () => {
      expect(parseGridPosition(raw, type)).toEqual({ ok: true, position: expected })
    })
  }

  const outOfRange: Array<{ raw: string; type: GridCollectionType }> = [
    { raw: 'Z99', type: 'micronix_plate' },
    { raw: 'I01', type: 'micronix_plate' },
    { raw: 'A13', type: 'micronix_plate' },
    { raw: 'A00', type: 'micronix_plate' },
    { raw: 'K01', type: 'cryovial_box' },
    { raw: 'A11', type: 'cryovial_box' },
  ]
  for (const { raw, type } of outOfRange) {
    it(`rejects "${raw}" as outside a ${type}`, () => {
      const result = parseGridPosition(raw, type)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain(`"${raw}"`)
        expect(result.error).toContain('outside')
        expect(result.error).toContain(gridPositionRange(type))
      }
    })
  }

  const garbage = ['B012', 'hello world', '--A01', 'NA01', 'A1145854300', 'AA01', '1A', 'A', 'A-1', 'A 1', '__mv_12']
  for (const raw of garbage) {
    it(`rejects "${raw}" as not a grid position`, () => {
      const result = parseGridPosition(raw, 'micronix_plate')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain(`"${raw}"`)
    })
  }

  it('rejects a blank position', () => {
    expect(parseGridPosition('  ', 'cryovial_box')).toEqual({ ok: false, error: 'Position is required for a cryovial box (A01–J10)' })
  })

  it('names each range', () => {
    expect(gridPositionRange('micronix_plate')).toBe('A01–H12')
    expect(gridPositionRange('cryovial_box')).toBe('A01–J10')
  })
})
