import { describe, it, expect } from 'vitest'
import { buildBulkImportTemplateContent } from '../bulk-import-csv'

describe('buildBulkImportTemplateContent', () => {
  it('subjects template has no specimen types', () => {
    const { csvContent, filename } = buildBulkImportTemplateContent({
      importType: 'subjects',
      containerType: 'none',
      specimenTypeNames: [],
    })
    expect(filename).toBe('subjects_template.csv')
    expect(csvContent).toContain('subject_name')
    expect(csvContent).toContain('SUBJ-001')
    expect(csvContent).toContain('study_short_code')
    expect(csvContent).toContain('NAM15')
  })

  it('subjects template with fixedStudyShortCode omits study_short_code column', () => {
    const { csvContent } = buildBulkImportTemplateContent({
      importType: 'subjects',
      containerType: 'none',
      fixedStudyShortCode: 'ST',
      specimenTypeNames: [],
    })
    expect(csvContent).not.toContain('study_short_code')
    expect(csvContent).toContain('subject_name')
  })

  it('specimens with containerType none uses first two specimen type names in example rows', () => {
    const { csvContent } = buildBulkImportTemplateContent({
      importType: 'specimens',
      containerType: 'none',
      specimenTypeNames: ['Serum', 'Plasma'],
    })
    expect(csvContent).toContain('specimen_type_name')
    expect(csvContent).toContain('Serum')
    expect(csvContent).toContain('Plasma')
    expect(csvContent).not.toContain('Whole Blood')
  })

  it('combined with containerType micronix_tube uses first specimen type and A01 position', () => {
    const { csvContent } = buildBulkImportTemplateContent({
      importType: 'combined',
      containerType: 'micronix_tube',
      specimenTypeNames: ['Whole Blood'],
    })
    expect(csvContent).toContain('Whole Blood')
    expect(csvContent).toContain('position')
    expect(csvContent).toMatch(/,A01,/)
  })

  it('combined with containerType cryovial_tube uses A01-style position (B01 not B5)', () => {
    const { csvContent } = buildBulkImportTemplateContent({
      importType: 'combined',
      containerType: 'cryovial_tube',
      specimenTypeNames: ['Plasma'],
    })
    expect(csvContent).toContain('Plasma')
    expect(csvContent).toMatch(/,B01,/)
    expect(csvContent).not.toContain(',B5,')
  })

  it('combined with containerType static_well uses first specimen type and A01', () => {
    const { csvContent } = buildBulkImportTemplateContent({
      importType: 'combined',
      containerType: 'static_well',
      specimenTypeNames: ['DNA'],
    })
    expect(csvContent).toContain('DNA')
    expect(csvContent).toMatch(/,A01,/)
  })

  it('combined with containerType paper uses first specimen type and no position column', () => {
    const { csvContent } = buildBulkImportTemplateContent({
      importType: 'combined',
      containerType: 'paper',
      specimenTypeNames: ['Blood Spot'],
    })
    expect(csvContent).toContain('Blood Spot')
    expect(csvContent).toContain('box_name')
    expect(csvContent).toContain('bag_name')
    expect(csvContent).not.toContain('position')
  })
})
