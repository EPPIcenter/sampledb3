import { describe, it, expect } from 'vitest'
import {
  getCollectionNameColumn,
  getContainerColumnsForBulkImport,
} from '../container-columns'

describe('container-columns', () => {
  describe('getCollectionNameColumn', () => {
    it('returns plate_name for micronix_tube and static_well', () => {
      expect(getCollectionNameColumn('micronix_tube')).toBe('plate_name')
      expect(getCollectionNameColumn('static_well')).toBe('plate_name')
    })
    it('returns box_name for cryovial_tube', () => {
      expect(getCollectionNameColumn('cryovial_tube')).toBe('box_name')
    })
    it('returns bag_name for paper', () => {
      expect(getCollectionNameColumn('paper')).toBe('bag_name')
    })
    it('returns plate_name for empty string', () => {
      expect(getCollectionNameColumn('')).toBe('plate_name')
    })
    it('returns null for none', () => {
      expect(getCollectionNameColumn('none')).toBeNull()
    })
  })

  describe('getContainerColumnsForBulkImport', () => {
    it('returns correct columns for micronix_tube', () => {
      expect(getContainerColumnsForBulkImport('micronix_tube')).toBe(
        'plate_name,barcode,position,comment'
      )
    })
    it('returns correct columns for cryovial_tube', () => {
      expect(getContainerColumnsForBulkImport('cryovial_tube')).toBe(
        'box_name,barcode,position,comment'
      )
    })
    it('returns correct columns for paper', () => {
      expect(getContainerColumnsForBulkImport('paper')).toBe(
        'bag_name,label,comment'
      )
    })
    it('returns correct columns for static_well', () => {
      expect(getContainerColumnsForBulkImport('static_well')).toBe(
        'plate_name,position,comment'
      )
    })
  })
})
