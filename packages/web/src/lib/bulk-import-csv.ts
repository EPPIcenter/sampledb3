import type { ContainerType } from './container-types'
import { buildCsv } from './csv'
import { getContainerColumnsForBulkImport } from './container-columns'

export interface BuildBulkImportTemplateParams {
  importType: 'subjects' | 'specimens' | 'combined'
  containerType: ContainerType | 'none'
  fixedStudyShortCode?: string
  /** At least one name; for containerType 'none' the first two are used for two example rows. */
  specimenTypeNames: string[]
}

function getTemplateExampleRow(
  type: ContainerType,
  specimenTypeName: string,
  fixedStudyShortCode?: boolean
): (string | null)[] {
  const subjectExample = 'SUBJ-001'
  const date = '2024-01-15'
  const base = fixedStudyShortCode
    ? [subjectExample, specimenTypeName, date]
    : ['NAM15', subjectExample, specimenTypeName, date]

  switch (type) {
    case 'micronix_tube':
      return [...base, 'PLATE-001', 'MTX-12345', 'A01', '']
    case 'cryovial_tube':
      return [...base, 'BOX-001', '', 'B01', '']
    case 'paper':
      return [...base, 'BOX-003', 'SPOT-001', '']
    case 'static_well':
      return [...base, 'PLATE-002', 'A01', '']
    default:
      return base
  }
}

/**
 * Build CSV template content and filename for the Bulk Import flow.
 * Uses specimen type names from the caller (e.g. from API) and A01-style positions.
 */
export function buildBulkImportTemplateContent(params: BuildBulkImportTemplateParams): {
  csvContent: string
  filename: string
} {
  const { importType, containerType, fixedStudyShortCode, specimenTypeNames } = params

  if (importType === 'subjects') {
    const filename = 'subjects_template.csv'
    if (fixedStudyShortCode) {
      return {
        csvContent: buildCsv(['subject_name'], [['SUBJ-001'], ['SUBJ-002']]),
        filename,
      }
    }
    return {
      csvContent: buildCsv(
        ['study_short_code', 'subject_name'],
        [['NAM15', 'SUBJ-001'], ['NAM15', 'SUBJ-002']]
      ),
      filename,
    }
  }

  const baseColumns = fixedStudyShortCode
    ? ['subject_name', 'specimen_type_name', 'collection_date']
    : ['study_short_code', 'subject_name', 'specimen_type_name', 'collection_date']
  const filename = importType === 'specimens' ? 'specimens_template.csv' : 'combined_template.csv'

  if (containerType === 'none') {
    const first = specimenTypeNames[0] ?? 'Whole Blood'
    const second = specimenTypeNames[1] ?? 'Plasma'
    const row1: (string | null)[] = fixedStudyShortCode
      ? ['SUBJ-001', first, '2024-01-15']
      : ['NAM15', 'SUBJ-001', first, '2024-01-15']
    const row2: (string | null)[] = fixedStudyShortCode
      ? ['SUBJ-001', second, '2024-01-15']
      : ['NAM15', 'SUBJ-001', second, '2024-01-15']
    return {
      csvContent: buildCsv(baseColumns, [row1, row2]),
      filename,
    }
  }

  const containerColumnList = getContainerColumnsForBulkImport(containerType).split(',')
  const columns = [...baseColumns, ...containerColumnList]
  const firstSpecimen = specimenTypeNames[0] ?? 'Whole Blood'
  const exampleRow = getTemplateExampleRow(containerType, firstSpecimen, Boolean(fixedStudyShortCode))
  return {
    csvContent: buildCsv(columns, [exampleRow]),
    filename,
  }
}
