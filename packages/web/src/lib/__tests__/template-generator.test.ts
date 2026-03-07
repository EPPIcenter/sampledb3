import { describe, it, expect } from 'vitest'
import { generateDerivationsTemplate } from '../template-generator'

const baseSettings = {
  derivationType: 'Extraction',
  specimenTypeName: 'Whole Blood',
  containerType: 'micronix_tube' as const,
  protocol: 'Standard',
  derivationDate: '2024-01-01',
}

describe('template-generator', () => {
  describe('generateDerivationsTemplate', () => {
    it('returns CSV string with header row', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'barcode',
        settings: baseSettings,
      })
      expect(csv).toContain('parent_container_barcode')
      expect(csv.split('\n').length).toBeGreaterThanOrEqual(1)
    })

    it('includes control_batch columns when parentType is control_batch', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'control_batch',
        settings: baseSettings,
        parentContainerType: 'paper',
      })
      expect(csv).toContain('parent_control_batch_name')
      expect(csv).toContain('parent_specimen_type_name')
      expect(csv).toContain('plate_name')
      expect(csv).toContain('position')
    })

    it('includes study_subject columns when parentType is study_subject', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'study_subject',
        settings: baseSettings,
      })
      expect(csv).toContain('parent_study_short_code')
      expect(csv).toContain('parent_subject_name')
      expect(csv).toContain('parent_specimen_type_name')
    })

    it('includes cryovial_position columns when parentType is cryovial_position', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'cryovial_position',
        settings: baseSettings,
      })
      expect(csv).toContain('parent_box_barcode')
      expect(csv).toContain('parent_position')
    })

    it('uses box_name when derived container type is cryovial_tube', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'barcode',
        settings: {
          ...baseSettings,
          containerType: 'cryovial_tube',
        },
      })
      expect(csv).toContain('box_name')
      expect(csv).not.toContain('plate_name')
    })

    it('uses bag_name when derived container type is paper', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'barcode',
        settings: {
          ...baseSettings,
          containerType: 'paper',
        },
      })
      expect(csv).toContain('bag_name')
      expect(csv).not.toContain('plate_name')
    })

    it('uses first specimen type name in example rows when specimenTypes provided', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'study_subject',
        settings: { ...baseSettings, specimenTypeName: '' },
        specimenTypes: [
          { id: 1, name: 'DBS' },
          { id: 2, name: 'DNA (DBS)' },
        ],
      })
      expect(csv).toContain('DBS')
    })

    it('uses exampleDerivationType and exampleProtocol when provided', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'barcode',
        settings: { ...baseSettings, derivationType: '', protocol: '' },
        exampleDerivationType: 'aliquot',
        exampleProtocol: 'SOP-99',
      })
      expect(csv).toContain('aliquot')
      expect(csv).toContain('SOP-99')
    })

    it('falls back to hardcoded derivation/specimen defaults when reference data not provided', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'control_batch',
        settings: { ...baseSettings, specimenTypeName: '', derivationType: '', protocol: '' },
        parentContainerType: 'paper',
      })
      expect(csv).toContain('DNA (DBS)')
      expect(csv).toContain('dna_extraction')
      expect(csv).toContain('Extraction v1')
      expect(csv).toContain('Whole Blood')
    })

    it('does not include unit_symbol column (default unit used for derived container)', () => {
      const csv = generateDerivationsTemplate({
        parentType: 'barcode',
        settings: { ...baseSettings, unitSymbol: '' },
      })
      expect(csv).not.toContain('unit_symbol')
    })
  })
})
