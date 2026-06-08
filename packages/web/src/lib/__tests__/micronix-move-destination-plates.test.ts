import { describe, it, expect } from 'vitest'
import {
  buildPendingDestinationPlates,
  getMissingDestinationPlateNames,
  isExistingPlateName,
} from '../micronix-move-destination-plates'

describe('micronix-move-destination-plates', () => {
  const plates = [{ name: 'PLATE-A' }, { name: 'PLATE-B' }]

  it('getMissingDestinationPlateNames returns names not in the catalog', () => {
    expect(getMissingDestinationPlateNames(['PLATE-A', 'NEW-PLATE', 'PLATE-B', 'NEW-PLATE'], plates)).toEqual([
      'NEW-PLATE',
    ])
  })

  it('isExistingPlateName matches by exact name', () => {
    expect(isExistingPlateName('PLATE-A', plates)).toBe(true)
    expect(isExistingPlateName('NEW-PLATE', plates)).toBe(false)
  })

  it('buildPendingDestinationPlates initializes pending rows', () => {
    expect(buildPendingDestinationPlates(['NEW-1', 'NEW-2'])).toEqual([
      { name: 'NEW-1', locationId: null, barcode: '', status: 'pending' },
      { name: 'NEW-2', locationId: null, barcode: '', status: 'pending' },
    ])
  })
})
