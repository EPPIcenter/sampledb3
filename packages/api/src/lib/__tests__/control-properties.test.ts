import { describe, it, expect } from 'vitest'
import { parseControlProperties } from '../control-properties'

describe('parseControlProperties', () => {
  it('returns empty strains and undefined fields when properties is null', () => {
    expect(parseControlProperties(null)).toEqual({
      strains: [],
      targetDensity: undefined,
      unitSymbol: undefined,
      targetDensityUnitId: undefined,
    })
  })

  it('returns empty strains when properties is undefined', () => {
    expect(parseControlProperties(undefined)).toEqual({
      strains: [],
      targetDensity: undefined,
      unitSymbol: undefined,
      targetDensityUnitId: undefined,
    })
  })

  it('throws when properties is invalid JSON string', () => {
    expect(() => parseControlProperties('not json')).toThrow('Invalid control properties JSON')
  })

  it('parses valid properties with strains as objects', () => {
    const props = {
      strains: [{ id: 1, name: 'Strain A', percentage: 50 }, { id: 2, name: 'Strain B' }],
      targetDensity: 5.2,
      targetDensityUnitSymbol: 'OD',
    }
    expect(parseControlProperties(props)).toEqual({
      strains: [
        { id: 1, name: 'Strain A', percentage: 50 },
        { id: 2, name: 'Strain B', percentage: undefined },
      ],
      targetDensity: 5.2,
      unitSymbol: 'OD',
      targetDensityUnitId: undefined,
    })
  })

  it('resolves strain names from strainMap when strains are numeric ids', () => {
    const strainMap = new Map<number, { name: string }>([
      [1, { name: 'Mapped A' }],
      [2, { name: 'Mapped B' }],
    ])
    expect(parseControlProperties({ strains: [1, 2] }, strainMap)).toEqual({
      strains: [
        { id: 1, name: 'Mapped A' },
        { id: 2, name: 'Mapped B' },
      ],
      targetDensity: undefined,
      unitSymbol: undefined,
      targetDensityUnitId: undefined,
    })
  })

  it('falls back to "Strain N" when strainMap has no name for id', () => {
    expect(parseControlProperties({ strains: [99] })).toEqual({
      strains: [{ id: 99, name: 'Strain 99' }],
      targetDensity: undefined,
      unitSymbol: undefined,
      targetDensityUnitId: undefined,
    })
  })

  it('parses targetDensity from string', () => {
    expect(parseControlProperties({ targetDensity: '3.14' })).toMatchObject({
      targetDensity: 3.14,
      strains: [],
    })
  })

  it('extracts unit symbol from targetDensityUnit object', () => {
    expect(
      parseControlProperties({
        targetDensityUnit: { symbol: 'OD600' },
      })
    ).toMatchObject({ unitSymbol: 'OD600', strains: [] })
  })

  it('parses targetDensityUnitId from string', () => {
    expect(parseControlProperties({ targetDensityUnitId: '7' })).toMatchObject({
      targetDensityUnitId: 7,
      strains: [],
    })
  })
})
