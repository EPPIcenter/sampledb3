import { describe, expect, it } from 'bun:test'
import {
  GRID_GEOMETRY,
  gridAxes,
  gridCellKeys,
  gridPositionKey,
  gridPositionRange,
  isStoredGridPosition,
  parseGridPosition,
  type GridCollectionType,
} from '../grid-position'

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

describe('grid geometry', () => {
  it('orders cryovial box rows and columns naturally', () => {
    expect(gridAxes('cryovial_box')).toEqual({
      rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      columns: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    })
  })

  it('lists every cell of a micronix plate row by row', () => {
    const keys = gridCellKeys('micronix_plate')
    expect(keys).toHaveLength(96)
    expect(keys.slice(0, 3)).toEqual(['A01', 'A02', 'A03'])
    expect(keys[12]).toBe('B01')
    expect(keys.at(-1)).toBe('H12')
  })

  it('accepts every cell it lists, and nothing past the last row or column', () => {
    for (const type of Object.keys(GRID_GEOMETRY) as GridCollectionType[]) {
      for (const key of gridCellKeys(type)) {
        expect(parseGridPosition(key, type)).toEqual({ ok: true, position: key })
      }
      const { rows, columns } = GRID_GEOMETRY[type]
      expect(parseGridPosition(`A${columns + 1}`, type).ok).toBe(false)
      expect(parseGridPosition(`${String.fromCharCode(65 + rows)}01`, type).ok).toBe(false)
    }
  })
})

describe('gridPositionKey', () => {
  it('normalizes a valid position to its cell key', () => {
    expect(gridPositionKey('A01', 'micronix_plate')).toBe('A01')
    expect(gridPositionKey('a1', 'micronix_plate')).toBe('A01')
    expect(gridPositionKey(' H12 ', 'micronix_plate')).toBe('H12')
    expect(gridPositionKey('J10', 'cryovial_box')).toBe('J10')
  })

  it('returns null for a missing position', () => {
    expect(gridPositionKey(null, 'micronix_plate')).toBeNull()
    expect(gridPositionKey(undefined, 'micronix_plate')).toBeNull()
    expect(gridPositionKey('', 'micronix_plate')).toBeNull()
    expect(gridPositionKey('   ', 'micronix_plate')).toBeNull()
  })

  it('returns null for a position outside the grid', () => {
    expect(gridPositionKey('I01', 'micronix_plate')).toBeNull()
    expect(gridPositionKey('A13', 'micronix_plate')).toBeNull()
    expect(gridPositionKey('A00', 'micronix_plate')).toBeNull()
    expect(gridPositionKey('K01', 'cryovial_box')).toBeNull()
    expect(gridPositionKey('A11', 'cryovial_box')).toBeNull()
    expect(gridPositionKey('Z99', 'cryovial_box')).toBeNull()
  })

  it('returns null for stored values that are not a row letter plus column number', () => {
    expect(gridPositionKey('--A01', 'cryovial_box')).toBeNull()
    expect(gridPositionKey('NA01', 'cryovial_box')).toBeNull()
    expect(gridPositionKey('A001', 'cryovial_box')).toBeNull()
    expect(gridPositionKey('A1145868849', 'micronix_plate')).toBeNull()
    expect(gridPositionKey('hello world', 'micronix_plate')).toBeNull()
  })

  it('places exactly the positions a write accepts', () => {
    const samples = ['A1', 'a01', 'B012', 'A001', '--A01', 'NA01', 'H12', 'I01', 'J10', 'K01', ' c3 ', '']
    for (const type of Object.keys(GRID_GEOMETRY) as GridCollectionType[]) {
      for (const raw of samples) {
        const parsed = parseGridPosition(raw, type)
        expect(gridPositionKey(raw, type)).toBe(parsed.ok ? parsed.position : null)
      }
    }
  })
})

describe('isStoredGridPosition', () => {
  it('accepts a missing position and a position in stored form', () => {
    expect(isStoredGridPosition(null, 'cryovial_box')).toBe(true)
    expect(isStoredGridPosition('J10', 'cryovial_box')).toBe(true)
    expect(isStoredGridPosition('H12', 'micronix_plate')).toBe(true)
  })

  it('rejects a position the rule rejects or would store differently', () => {
    expect(isStoredGridPosition('--A01', 'cryovial_box')).toBe(false)
    expect(isStoredGridPosition('NA01', 'cryovial_box')).toBe(false)
    expect(isStoredGridPosition('A1', 'cryovial_box')).toBe(false)
    expect(isStoredGridPosition('a01', 'micronix_plate')).toBe(false)
    expect(isStoredGridPosition('J10', 'micronix_plate')).toBe(false)
  })
})
