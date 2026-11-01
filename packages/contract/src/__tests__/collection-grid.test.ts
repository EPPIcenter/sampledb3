import { describe, expect, it } from 'bun:test'
import {
  CRYOVIAL_BOX_GRID,
  MICRONIX_PLATE_GRID,
  gridCellKeys,
  gridPositionKey,
} from '../collection-grid'

describe('collection grid geometry', () => {
  it('orders cryovial box rows and columns naturally', () => {
    expect(CRYOVIAL_BOX_GRID.rows).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])
    expect(CRYOVIAL_BOX_GRID.columns).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('lists every cell of a micronix plate row by row', () => {
    const keys = gridCellKeys(MICRONIX_PLATE_GRID)
    expect(keys).toHaveLength(96)
    expect(keys.slice(0, 3)).toEqual(['A01', 'A02', 'A03'])
    expect(keys[12]).toBe('B01')
    expect(keys.at(-1)).toBe('H12')
  })
})

describe('gridPositionKey', () => {
  it('normalizes a valid position to its cell key', () => {
    expect(gridPositionKey('A01', MICRONIX_PLATE_GRID)).toBe('A01')
    expect(gridPositionKey('a1', MICRONIX_PLATE_GRID)).toBe('A01')
    expect(gridPositionKey(' H12 ', MICRONIX_PLATE_GRID)).toBe('H12')
    expect(gridPositionKey('J10', CRYOVIAL_BOX_GRID)).toBe('J10')
  })

  it('returns null for a missing position', () => {
    expect(gridPositionKey(null, MICRONIX_PLATE_GRID)).toBeNull()
    expect(gridPositionKey(undefined, MICRONIX_PLATE_GRID)).toBeNull()
    expect(gridPositionKey('', MICRONIX_PLATE_GRID)).toBeNull()
    expect(gridPositionKey('   ', MICRONIX_PLATE_GRID)).toBeNull()
  })

  it('returns null for a position outside the grid', () => {
    expect(gridPositionKey('I01', MICRONIX_PLATE_GRID)).toBeNull()
    expect(gridPositionKey('A13', MICRONIX_PLATE_GRID)).toBeNull()
    expect(gridPositionKey('A00', MICRONIX_PLATE_GRID)).toBeNull()
    expect(gridPositionKey('K01', CRYOVIAL_BOX_GRID)).toBeNull()
    expect(gridPositionKey('A11', CRYOVIAL_BOX_GRID)).toBeNull()
    expect(gridPositionKey('Z99', CRYOVIAL_BOX_GRID)).toBeNull()
  })

  it('returns null for stored values that are not a row letter plus column number', () => {
    expect(gridPositionKey('--A01', CRYOVIAL_BOX_GRID)).toBeNull()
    expect(gridPositionKey('NA01', CRYOVIAL_BOX_GRID)).toBeNull()
    expect(gridPositionKey('A1145868849', MICRONIX_PLATE_GRID)).toBeNull()
    expect(gridPositionKey('hello world', MICRONIX_PLATE_GRID)).toBeNull()
  })
})
