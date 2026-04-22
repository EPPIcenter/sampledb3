import { describe, it, expect } from 'vitest'
import {
  SUPPORTED_QPCR_INSTRUMENTS,
  getQpcrInstrumentById,
  type QpcrInstrument,
} from '../qpcr-instruments'

describe('qpcr-instruments', () => {
  describe('SUPPORTED_QPCR_INSTRUMENTS', () => {
    it('has at least Biorad_CFX and QuantStudio', () => {
      const ids = SUPPORTED_QPCR_INSTRUMENTS.map((i: QpcrInstrument) => i.id)
      expect(ids).toContain('Biorad_CFX')
      expect(ids).toContain('QuantStudio')
    })

    it('each instrument has id, displayName, templateFileExtension, templateMimeType', () => {
      for (const inst of SUPPORTED_QPCR_INSTRUMENTS) {
        expect(inst).toHaveProperty('id')
        expect(inst).toHaveProperty('displayName')
        expect(inst).toHaveProperty('templateFileExtension')
        expect(inst).toHaveProperty('templateMimeType')
        expect(typeof inst.id).toBe('string')
        expect(inst.displayName.length).toBeGreaterThan(0)
        expect(inst.templateFileExtension.length).toBeGreaterThan(0)
        expect(inst.templateMimeType.length).toBeGreaterThan(0)
      }
    })

    it('Biorad_CFX has csv extension and CSV mime type', () => {
      const biorad = SUPPORTED_QPCR_INSTRUMENTS.find((i) => i.id === 'Biorad_CFX')
      expect(biorad).toBeDefined()
      expect(biorad!.templateFileExtension).toBe('csv')
      expect(biorad!.templateMimeType).toContain('csv')
    })

    it('QuantStudio has txt extension and tab-separated mime type', () => {
      const qs = SUPPORTED_QPCR_INSTRUMENTS.find((i) => i.id === 'QuantStudio')
      expect(qs).toBeDefined()
      expect(qs!.templateFileExtension).toBe('txt')
      expect(qs!.templateMimeType).toMatch(/tab-separated|tsv/i)
    })
  })

  describe('getQpcrInstrumentById', () => {
    it('returns instrument for valid id', () => {
      expect(getQpcrInstrumentById('Biorad_CFX')).toEqual(
        expect.objectContaining({
          id: 'Biorad_CFX',
          displayName: 'Bio-Rad CFX 96',
          templateFileExtension: 'csv',
          templateMimeType: 'text/csv; charset=utf-8',
        })
      )
      expect(getQpcrInstrumentById('QuantStudio')).toEqual(
        expect.objectContaining({
          id: 'QuantStudio',
          displayName: 'Quant Studio',
          templateFileExtension: 'txt',
          templateMimeType: 'text/tab-separated-values; charset=utf-8',
        })
      )
    })

    it('returns undefined for unknown id', () => {
      expect(getQpcrInstrumentById('Unknown')).toBeUndefined()
      expect(getQpcrInstrumentById('')).toBeUndefined()
    })
  })
})
