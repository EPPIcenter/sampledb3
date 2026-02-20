import { describe, it, expect } from 'vitest'
import {
  buildCollectionTableRow,
  buildSheetPaperTableRow,
  COLLECTION_GRID_TABLE_COLUMNS,
  COLLECTION_SHEET_TABLE_COLUMNS,
} from '../collection-table-columns'

describe('collection-table-columns', () => {
  it('grid table columns do not include any ID columns', () => {
    const keys = COLLECTION_GRID_TABLE_COLUMNS.map((c) => c.key)
    expect(keys).not.toContain('container_id')
    expect(keys).not.toContain('specimen_id')
    expect(keys).not.toContain('subject_id')
    expect(keys).not.toContain('study_id')
    expect(keys).not.toContain('control_batch_id')
    expect(keys).toContain('position')
    expect(keys).toContain('barcode')
    expect(keys).toContain('status')
    expect(keys).toContain('subject_name')
  })

  it('sheet table columns do not include any ID columns', () => {
    const keys = COLLECTION_SHEET_TABLE_COLUMNS.map((c) => c.key)
    expect(keys).not.toContain('container_id')
    expect(keys).not.toContain('specimen_id')
    expect(keys).toContain('sheet')
    expect(keys).toContain('position')
  })

  it('buildCollectionTableRow returns no ID fields', () => {
    const row = buildCollectionTableRow({
      position: 'A01',
      barcode: 'MTX-001',
      container: {
        remainingQuantity: 1,
        state: { name: 'Active' },
        source: { type: 'subject', name: 'Subject-1', study: { code: 'STUDY1' } },
        specimen: { collectionDate: '2024-01-15' },
      },
    })
    expect(row).not.toHaveProperty('container_id')
    expect(row).not.toHaveProperty('specimen_id')
    expect(row).toHaveProperty('position', 'A01')
    expect(row).toHaveProperty('barcode', 'MTX-001')
    expect(row).toHaveProperty('status', 'In Use')
    expect(row).toHaveProperty('subject_name', 'Subject-1')
    expect(row).toHaveProperty('study_code', 'STUDY1')
    expect(row).toHaveProperty('state', 'Active')
    expect(row).toHaveProperty('collection_date', '2024-01-15')
  })

  it('buildSheetPaperTableRow includes sheet name and no IDs', () => {
    const row = buildSheetPaperTableRow(
      {
        position: 'P1',
        barcode: 'BAR',
        container: { remainingQuantity: 0, source: { type: 'control', name: 'Ctrl', definitionName: 'DBS', controlType: 'Quality' } },
      },
      'Sheet-A'
    )
    expect(row).toHaveProperty('sheet', 'Sheet-A')
    expect(row).toHaveProperty('position', 'P1')
    expect(row).not.toHaveProperty('container_id')
    expect(row).toHaveProperty('control_definition_name', 'DBS')
    expect(row).toHaveProperty('control_type', 'Quality')
    expect(row).toHaveProperty('status', 'Exhausted')
  })
})
