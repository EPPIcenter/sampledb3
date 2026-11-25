import { describe, it, expect } from 'vitest'
import {
  bulkCombinedValidateRequestSchema,
  csvRowToContainerWriteInput,
  mapBulkImportTemplateCsv,
} from '@sampledb/contract'
import { buildBulkImportTemplateContent } from '../bulk-import-csv'
import {
  getBulkImportRequiredFields,
  parseBulkImportCSV,
} from '../bulk-import-validation'
import type { ContainerType } from '../container-types'

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

  it('keeps the exact header columns in the exact order for every downloadable template', () => {
    const headerOf = (csvContent: string) =>
      csvContent.replace(/^\uFEFF/, '').split(/\r?\n/)[0]

    expect(
      headerOf(
        buildBulkImportTemplateContent({
          importType: 'subjects',
          containerType: 'none',
          specimenTypeNames: [],
        }).csvContent,
      ),
    ).toBe('study_short_code,subject_name')

    expect(
      headerOf(
        buildBulkImportTemplateContent({
          importType: 'combined',
          containerType: 'none',
          specimenTypeNames: ['Whole Blood'],
        }).csvContent,
      ),
    ).toBe('study_short_code,subject_name,specimen_type_name,collection_date')

    expect(
      headerOf(
        buildBulkImportTemplateContent({
          importType: 'combined',
          containerType: 'micronix_tube',
          specimenTypeNames: ['Whole Blood'],
        }).csvContent,
      ),
    ).toBe('study_short_code,subject_name,specimen_type_name,collection_date,plate_name,barcode,position,comment')

    expect(
      headerOf(
        buildBulkImportTemplateContent({
          importType: 'combined',
          containerType: 'cryovial_tube',
          specimenTypeNames: ['Whole Blood'],
        }).csvContent,
      ),
    ).toBe('study_short_code,subject_name,specimen_type_name,collection_date,box_name,barcode,position,comment')

    expect(
      headerOf(
        buildBulkImportTemplateContent({
          importType: 'combined',
          containerType: 'paper',
          specimenTypeNames: ['Blood Spot'],
        }).csvContent,
      ),
    ).toBe('study_short_code,subject_name,specimen_type_name,collection_date,box_name,bag_name,sheet_name,sublabel,comment')

    expect(
      headerOf(
        buildBulkImportTemplateContent({
          importType: 'combined',
          containerType: 'static_well',
          specimenTypeNames: ['DNA'],
        }).csvContent,
      ),
    ).toBe('study_short_code,subject_name,specimen_type_name,collection_date,plate_name,position,comment')
  })

  describe('every downloaded template passes validation unchanged', () => {
    const containerTypes: ContainerType[] = ['micronix_tube', 'cryovial_tube', 'paper', 'static_well']
    const cases = containerTypes.flatMap((containerType) =>
      (['specimens', 'combined'] as const).flatMap((importType) =>
        [undefined, 'ST'].map((fixedStudyShortCode) => ({ containerType, importType, fixedStudyShortCode }))
      )
    )

    it.each(cases)(
      '$importType template for $containerType (fixed study: $fixedStudyShortCode)',
      ({ containerType, importType, fixedStudyShortCode }) => {
        const { csvContent } = buildBulkImportTemplateContent({
          importType,
          containerType,
          fixedStudyShortCode,
          specimenTypeNames: ['Whole Blood'],
        })
        const rows = parseBulkImportCSV(csvContent)
        expect(rows.length).toBeGreaterThan(0)

        const required = getBulkImportRequiredFields({ importType, containerType, fixedStudyShortCode })
        for (const row of rows) {
          for (const field of required) {
            // "box_name or bag_name": exactly one of the columns has a value.
            const filled = field.split(' or ').filter((column) => (row[column] ?? '').trim() !== '')
            expect(filled, `${field} in ${JSON.stringify(row)}`).toHaveLength(1)
          }
          // The contract's own CSV row rules, with a sheet name required for paper.
          expect(
            csvRowToContainerWriteInput(row, { defaultContainerType: containerType, requireSheetName: true })
          ).toMatchObject({ success: true })
        }

        const mapped = mapBulkImportTemplateCsv(csvContent, {
          containerType,
          defaultStudyShortCode: fixedStudyShortCode,
          atomicMode: 'full_file',
        })
        expect(mapped.ok).toBe(true)
        if (!mapped.ok) return
        expect(bulkCombinedValidateRequestSchema.safeParse(mapped.validateRequest).success).toBe(true)
      }
    )

    it('paper example row names a box, a sheet, and a sublabel', () => {
      const { csvContent } = buildBulkImportTemplateContent({
        importType: 'combined',
        containerType: 'paper',
        specimenTypeNames: ['Blood Spot'],
      })
      expect(parseBulkImportCSV(csvContent)[0]).toMatchObject({
        box_name: 'BOX-003',
        bag_name: '',
        sheet_name: 'SHEET-001',
        sublabel: 'SPOT-001',
      })
    })
  })
})
