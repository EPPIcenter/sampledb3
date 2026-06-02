import { describe, expect, it } from 'bun:test'
import { formatExportCellValue, getExportColumnKind } from '../export-columns'

describe('export column catalog', () => {
  it('assigns expected kinds to container export columns', () => {
    expect(getExportColumnKind('barcode')).toBe('identifier')
    expect(getExportColumnKind('target_density')).toBe('numeric')
    expect(getExportColumnKind('collection_date')).toBe('date')
    expect(getExportColumnKind('created')).toBe('timestamp')
    expect(getExportColumnKind('specimen_type')).toBe('text')
  })

  it('assigns expected kinds to simple export columns', () => {
    expect(getExportColumnKind('id')).toBe('identifier')
    expect(getExportColumnKind('count')).toBe('numeric')
    expect(getExportColumnKind('source_type')).toBe('text')
  })

  it('defaults unknown columns to text without digit heuristics', () => {
    expect(getExportColumnKind('custom_code')).toBe('text')
    expect(formatExportCellValue('custom_code', '00123')).toBe('00123')
  })
})

describe('formatExportCellValue', () => {
  it('exports identifiers as plain strings without Excel formulas', () => {
    expect(formatExportCellValue('barcode', '00123')).toBe('00123')
    expect(formatExportCellValue('subject_id', 12345)).toBe('12345')
  })

  it('keeps numeric columns as numbers', () => {
    expect(formatExportCellValue('count', 42)).toBe(42)
    expect(formatExportCellValue('target_density', 1.5)).toBe(1.5)
  })

  it('formats collection_date as date-only', () => {
    expect(formatExportCellValue('collection_date', '2024-01-15T10:30:00Z')).toBe('2024-01-15')
  })

  it('formats created as ISO timestamp', () => {
    const result = formatExportCellValue('created', new Date('2024-01-15T10:30:00Z'))
    expect(result).toContain('2024-01-15T10:30:00')
  })
})
