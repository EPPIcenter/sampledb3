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
      expect(csv).toContain('collection_name')
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
  })
})
