import { describe, it, expect } from 'vitest'
import {
  buildCollectionTableRow,
  buildSheetPaperTableRow,
  getTableColumnsFromExportConfig,
  COLLECTION_GRID_TABLE_COLUMNS,
  COLLECTION_GRID_TABLE_ROW_KEYS,
  COLLECTION_SHEET_TABLE_COLUMNS,
  COLLECTION_SHEET_TABLE_ROW_KEYS,
} from '../collection-table-columns'
import { EXPORT_ENTRY_COLUMNS } from '../export-columns'

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
        tags: [{ id: 1, name: 'QC' }],
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
    expect(row).toHaveProperty('tags', 'QC')
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

  describe('getTableColumnsFromExportConfig', () => {

    it('returns only keys that exist in availableRowKeys, in config order, with labels', () => {
      const configKeys = ['container_id', 'position', 'barcode', 'subject_name', 'study_id']
      const result = getTableColumnsFromExportConfig(configKeys, COLLECTION_GRID_TABLE_ROW_KEYS)
      expect(result.map((c) => c.key)).toEqual(['position', 'barcode', 'subject_name'])
      expect(result[0].label).toBe('Position')
      expect(result[1].label).toBe('Barcode')
      expect(result[2].label).toBe('Subject Name')
    })

    it('returns empty array when no config keys match availableRowKeys', () => {
      const configKeys = ['container_id', 'specimen_id', 'study_id']
      const result = getTableColumnsFromExportConfig(configKeys, COLLECTION_GRID_TABLE_ROW_KEYS)
      expect(result).toEqual([])
    })

    it('preserves config order for matching keys', () => {
      const configKeys = ['tags', 'collection_date', 'position']
      const result = getTableColumnsFromExportConfig(configKeys, COLLECTION_GRID_TABLE_ROW_KEYS)
      expect(result.map((c) => c.key)).toEqual(['tags', 'collection_date', 'position'])
    })

    it('includes export config columns like comment and collection_name when in config', () => {
      const configKeys = ['comment', 'collection_name', 'location_path']
      const result = getTableColumnsFromExportConfig(configKeys, COLLECTION_GRID_TABLE_ROW_KEYS)
      expect(result.map((c) => c.key)).toEqual(['comment', 'collection_name', 'location_path'])
    })

    it('sheet table row keys include sheet plus grid keys', () => {
      expect(COLLECTION_SHEET_TABLE_ROW_KEYS.has('sheet')).toBe(true)
      expect(COLLECTION_SHEET_TABLE_ROW_KEYS.has('position')).toBe(true)
      expect(COLLECTION_SHEET_TABLE_ROW_KEYS.has('comment')).toBe(true)
    })
  })

  it('buildCollectionTableRow keys are a subset of export column keys', () => {
    const exportKeys = new Set(EXPORT_ENTRY_COLUMNS.map((c) => c.key))
    const row = buildCollectionTableRow({
      position: 'A01',
      barcode: 'X',
      container: { remainingQuantity: 1, source: { type: 'subject', name: 'S', study: { code: 'C' } } },
    })
    for (const key of Object.keys(row)) {
      expect(exportKeys.has(key), `Row key "${key}" should exist in export columns`).toBe(true)
    }
  })
})
