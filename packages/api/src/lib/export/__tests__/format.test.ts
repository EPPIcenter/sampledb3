import { describe, it, expect } from 'vitest'
import { parseCsv } from '@sampledb/contract'
import { formatSimpleCSV } from '../format'

const lfNoBom = { delimiter: ',', includeBOM: false, lineEnding: 'LF' as const }

describe('formatSimpleCSV', () => {
  describe('RFC 4180 cell escaping via contract serializeCsv', () => {
    it('outputs plain unquoted cells when no escaping is needed', () => {
      const result = formatSimpleCSV(['name'], [['John Doe']], lfNoBom)
      expect(result).toBe('name\nJohn Doe')
    })

    it('escapes quotes in cells', () => {
      const result = formatSimpleCSV(['description'], [['He said "Hello"']], lfNoBom)
      expect(result).toBe('description\n"He said ""Hello"""')
    })

    it('quotes cells with commas', () => {
      const result = formatSimpleCSV(['name'], [['Smith, John']], lfNoBom)
      expect(result).toBe('name\n"Smith, John"')
    })

    it('quotes cells with newlines', () => {
      const result = formatSimpleCSV(['description'], [['Line 1\nLine 2']], lfNoBom)
      expect(result).toBe('description\n"Line 1\nLine 2"')
    })

    it('handles empty, null, and undefined values', () => {
      const result = formatSimpleCSV(
        ['name', 'email'],
        [['John', ''], ['Jane', null], ['Bob', undefined]],
        lfNoBom
      )
      expect(parseCsv(result)).toEqual([
        ['name', 'email'],
        ['John', ''],
        ['Jane', ''],
        ['Bob', ''],
      ])
    })
  })

  describe('identifier and numeric columns (no Excel formula wrappers)', () => {
    it('exports numeric IDs as plain values', () => {
      const result = formatSimpleCSV(['id'], [[123], [456]], lfNoBom)
      expect(result).not.toContain('=""')
      expect(parseCsv(result)).toEqual([
        ['id'],
        ['123'],
        ['456'],
      ])
    })

    it('exports string identifiers with leading zeros as plain values', () => {
      const result = formatSimpleCSV(['id'], [['00123']], lfNoBom)
      expect(result).not.toContain('=""')
      expect(parseCsv(result)).toEqual([['id'], ['00123']])
    })

    it('exports subject_id and control_batch_id without Excel text formulas', () => {
      const result = formatSimpleCSV(
        ['subject_id', 'control_batch_id'],
        [[12345, 789]],
        lfNoBom
      )
      expect(result).not.toMatch(/=""/)
      expect(parseCsv(result)).toEqual([
        ['subject_id', 'control_batch_id'],
        ['12345', '789'],
      ])
    })

    it('keeps true numeric fields as unquoted numbers', () => {
      const result = formatSimpleCSV(['count'], [[42]], lfNoBom)
      expect(result).toBe('count\n42')
      expect(result).not.toContain('="')
    })

    it('does not apply digit heuristic to unknown columns', () => {
      const result = formatSimpleCSV(['code'], [['00123']], lfNoBom)
      expect(result).not.toContain('=""')
      expect(parseCsv(result)).toEqual([['code'], ['00123']])
    })

    it('exports non-numeric text columns unchanged', () => {
      const result = formatSimpleCSV(['specimen_type'], [['Blood']], lfNoBom)
      expect(result).toBe('specimen_type\nBlood')
    })
  })

  describe('date formatting', () => {
    it('formats collection_date as ISO 8601 date only', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const result = formatSimpleCSV(['collection_date'], [[date]], lfNoBom)
      expect(result).toContain('2024-01-15')
      expect(result).not.toContain('T')
      expect(result).not.toContain('10:30')
    })

    it('formats collection_date string as ISO 8601 date only', () => {
      const result = formatSimpleCSV(['collection_date'], [['2024-01-15']], lfNoBom)
      expect(result).toBe('collection_date\n2024-01-15')
    })

    it('formats created timestamp as full ISO 8601', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const result = formatSimpleCSV(['created'], [[date]], lfNoBom)
      expect(result).toContain('2024-01-15T10:30:00')
    })

    it('formats last_updated timestamp as full ISO 8601', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const result = formatSimpleCSV(['last_updated'], [[date]], lfNoBom)
      expect(result).toContain('2024-01-15T10:30:00')
    })

    it('extracts date part from ISO datetime strings to avoid timezone issues', () => {
      const result1 = formatSimpleCSV(['collection_date'], [['2024-01-15T23:30:00']], lfNoBom)
      expect(parseCsv(result1)[1]).toEqual(['2024-01-15'])

      const result2 = formatSimpleCSV(['collection_date'], [['2024-01-15 10:30:00']], lfNoBom)
      expect(parseCsv(result2)[1]).toEqual(['2024-01-15'])

      const result3 = formatSimpleCSV(['collection_date'], [['2024-01-15T10:30:00Z']], lfNoBom)
      expect(parseCsv(result3)[1]).toEqual(['2024-01-15'])
    })

    it('handles invalid collection_date gracefully', () => {
      const result = formatSimpleCSV(['collection_date'], [['invalid-date']], lfNoBom)
      expect(result).toContain('invalid-date')
    })
  })

  describe('delimiter, line ending, and BOM options', () => {
    it('uses comma delimiter by default', () => {
      const result = formatSimpleCSV(['col1', 'col2'], [['val1', 'val2']], { includeBOM: false, lineEnding: 'LF' })
      expect(result).toBe('col1,col2\nval1,val2')
    })

    it('uses semicolon delimiter when specified', () => {
      const result = formatSimpleCSV(
        ['col1', 'col2'],
        [['val1', 'val2']],
        { delimiter: ';', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('col1;col2\nval1;val2')
    })

    it('uses tab delimiter when specified', () => {
      const result = formatSimpleCSV(
        ['col1', 'col2'],
        [['val1', 'val2']],
        { delimiter: '\t', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('col1\tcol2\nval1\tval2')
    })

    it('uses CRLF by default', () => {
      const result = formatSimpleCSV(['col1'], [['val1']], { includeBOM: false })
      expect(result).toBe('col1\r\nval1')
    })

    it('uses LF when specified', () => {
      const result = formatSimpleCSV(['col1'], [['val1']], lfNoBom)
      expect(result).toBe('col1\nval1')
    })

    it('includes BOM by default', () => {
      const result = formatSimpleCSV(['col1'], [['val1']], { lineEnding: 'LF' })
      expect(result.startsWith('\uFEFF')).toBe(true)
    })

    it('omits BOM when set to false', () => {
      const result = formatSimpleCSV(['col1'], [['val1']], lfNoBom)
      expect(result.startsWith('\uFEFF')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('returns empty string for empty headers and rows', () => {
      expect(formatSimpleCSV([], [], lfNoBom)).toBe('')
    })

    it('returns header only when there are no data rows', () => {
      const result = formatSimpleCSV(['col1', 'col2'], [], lfNoBom)
      expect(result).toBe('col1,col2')
    })

    it('handles rows with fewer columns than headers', () => {
      const result = formatSimpleCSV(['col1', 'col2', 'col3'], [['val1', 'val2']], lfNoBom)
      expect(parseCsv(result)).toEqual([
        ['col1', 'col2', 'col3'],
        ['val1', 'val2', ''],
      ])
    })

    it('handles rows with more columns than headers', () => {
      const result = formatSimpleCSV(['col1', 'col2'], [['val1', 'val2', 'val3']], lfNoBom)
      expect(parseCsv(result)).toEqual([
        ['col1', 'col2'],
        ['val1', 'val2'],
      ])
    })

    it('handles cells starting with equals sign as plain text', () => {
      const result = formatSimpleCSV(['formula'], [['=SUM(A1:A10)']], lfNoBom)
      expect(result).toBe('formula\n=SUM(A1:A10)')
    })
  })
})
