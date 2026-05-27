import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { formatSimpleCSV } from '../format'

describe('formatSimpleCSV', () => {
  describe('escapeCell function', () => {
    it('should escape regular text cells with quotes', () => {
      const result = formatSimpleCSV(
        ['name'],
        [['John Doe']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"name"\n"John Doe"')
    })

    it('should escape quotes in regular cells', () => {
      const result = formatSimpleCSV(
        ['description'],
        [['He said "Hello"']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"description"\n"He said ""Hello"""')
    })

    it('should properly escape Excel-formatted text cells', () => {
      // Excel text format ="123" should become "=""123""" in CSV
      const result = formatSimpleCSV(
        ['id'],
        [[123]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // id is in alwaysTextFields, so 123 becomes ="123", which should be escaped as "=""123"""
      // The result should be: "id"\n"=""123"""
      // Check that the cell value contains the properly escaped Excel format
      const cellValue = result.split('\n')[1]
      expect(cellValue).toBe('"=""123"""')
    })

    it('should escape quotes inside Excel-formatted cells', () => {
      // If a value like ="test"value" exists, it should be properly escaped
      const result = formatSimpleCSV(
        ['barcode'],
        [['test"value']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // barcode is in alwaysTextFields but not numeric, so it's just "test"value"
      // which should be escaped as "test""value"
      expect(result).toContain('"test""value"')
    })

    it('should handle cells with commas', () => {
      const result = formatSimpleCSV(
        ['name'],
        [['Smith, John']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"name"\n"Smith, John"')
    })

    it('should handle cells with newlines', () => {
      const result = formatSimpleCSV(
        ['description'],
        [['Line 1\nLine 2']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"description"\n"Line 1\nLine 2"')
    })

    it('should handle empty cells', () => {
      const result = formatSimpleCSV(
        ['name', 'email'],
        [['John', '']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"name","email"\n"John",""')
    })

    it('should handle null and undefined values', () => {
      const result = formatSimpleCSV(
        ['name', 'email'],
        [['John', null], ['Jane', undefined]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"name","email"\n"John",""\n"Jane",""')
    })
  })

  describe('header escaping', () => {
    it('should escape headers with commas', () => {
      const result = formatSimpleCSV(
        ['Name, Full'],
        [['John Doe']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"Name, Full"\n"John Doe"')
    })

    it('should escape headers with quotes', () => {
      const result = formatSimpleCSV(
        ['Description "Details"'],
        [['Value']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"Description ""Details"""\n"Value"')
    })

    it('should escape headers with newlines', () => {
      const result = formatSimpleCSV(
        ['Header\nSubheader'],
        [['Value']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"Header\nSubheader"\n"Value"')
    })
  })

  describe('Excel text formatting', () => {
    it('should format numeric IDs as Excel text', () => {
      const result = formatSimpleCSV(
        ['id'],
        [[123], [456]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // id is in alwaysTextFields, so numeric values should be formatted as ="123"
      const rows = result.split('\n')
      expect(rows[1]).toBe('"=""123"""')
      expect(rows[2]).toBe('"=""456"""')
    })

    it('should format numeric subject_id as Excel text', () => {
      const result = formatSimpleCSV(
        ['subject_id'],
        [[12345]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      const rows = result.split('\n')
      expect(rows[1]).toBe('"=""12345"""')
    })

    it('should format numeric values in alwaysTextFields as Excel text', () => {
      const result = formatSimpleCSV(
        ['control_batch_id'],
        [[789]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      const rows = result.split('\n')
      expect(rows[1]).toBe('"=""789"""')
    })

    it('should NOT format numeric fields as Excel text', () => {
      const result = formatSimpleCSV(
        ['count'],
        [[42]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // count is in numericFields, so it should NOT be formatted as ="42"
      expect(result).not.toContain('="42"')
      expect(result).toContain('"42"')
    })

    it('should format other numeric-looking values as Excel text', () => {
      const result = formatSimpleCSV(
        ['code'],
        [['00123']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // code is not in alwaysTextFields, but looks numeric, so should be formatted as ="00123"
      const rows = result.split('\n')
      expect(rows[1]).toBe('"=""00123"""')
    })

    it('should NOT format non-numeric alwaysTextFields as Excel text', () => {
      const result = formatSimpleCSV(
        ['specimen_type'],
        [['Blood']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // specimen_type is in alwaysTextFields but not numeric, so just regular quoted
      expect(result).toContain('"Blood"')
      expect(result).not.toContain('="Blood"')
    })
  })

  describe('date formatting', () => {
    it('should format collection_date as ISO 8601 date only', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const result = formatSimpleCSV(
        ['collection_date'],
        [[date]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toContain('2024-01-15')
      expect(result).not.toContain('T')
      expect(result).not.toContain('10:30')
    })

    it('should format collection_date string as ISO 8601 date only', () => {
      const result = formatSimpleCSV(
        ['collection_date'],
        [['2024-01-15']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toContain('2024-01-15')
    })

    it('should format created timestamp as full ISO 8601', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const result = formatSimpleCSV(
        ['created'],
        [[date]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toContain('2024-01-15T10:30:00')
    })

    it('should format last_updated timestamp as full ISO 8601', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const result = formatSimpleCSV(
        ['last_updated'],
        [[date]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toContain('2024-01-15T10:30:00')
    })

    it('should handle collection_date in various string formats', () => {
      // Test with ISO string
      const result1 = formatSimpleCSV(
        ['collection_date'],
        [['2024-01-15T10:30:00Z']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result1).toContain('2024-01-15')
      expect(result1).not.toContain('T10:30')

      // Test with date-only string (already ISO)
      const result2 = formatSimpleCSV(
        ['collection_date'],
        [['2024-01-15']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result2).toContain('2024-01-15')

      // Test with Date object
      const result3 = formatSimpleCSV(
        ['collection_date'],
        [[new Date('2024-01-15T10:30:00Z')]],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result3).toContain('2024-01-15')
      expect(result3).not.toContain('T10:30')
    })

    it('should extract date part from ISO datetime strings to avoid timezone issues', () => {
      // Test with ISO datetime without timezone (should extract date part directly)
      const result1 = formatSimpleCSV(
        ['collection_date'],
        [['2024-01-15T23:30:00']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // Should extract '2024-01-15' directly, not parse and convert (which might shift date due to timezone)
      const rows1 = result1.split('\n')
      expect(rows1[1]).toBe('"2024-01-15"')

      // Test with ISO datetime with space separator
      const result2 = formatSimpleCSV(
        ['collection_date'],
        [['2024-01-15 10:30:00']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      const rows2 = result2.split('\n')
      expect(rows2[1]).toBe('"2024-01-15"')

      // Test with ISO datetime with Z timezone
      const result3 = formatSimpleCSV(
        ['collection_date'],
        [['2024-01-15T10:30:00Z']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      const rows3 = result3.split('\n')
      expect(rows3[1]).toBe('"2024-01-15"')
    })

    it('should handle invalid collection_date gracefully', () => {
      const result = formatSimpleCSV(
        ['collection_date'],
        [['invalid-date']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // Should return the string as-is if it can't be parsed
      expect(result).toContain('invalid-date')
    })

    it('should handle null/undefined collection_date', () => {
      const result = formatSimpleCSV(
        ['collection_date'],
        [[null], [undefined], ['']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      const rows = result.split('\n')
      expect(rows[0]).toBe('"collection_date"')
      expect(rows[1]).toBe('""')
      expect(rows[2]).toBe('""')
      expect(rows[3]).toBe('""')
    })
  })

  describe('delimiter options', () => {
    it('should use comma delimiter by default', () => {
      const result = formatSimpleCSV(
        ['col1', 'col2'],
        [['val1', 'val2']],
        { includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"col1","col2"\n"val1","val2"')
    })

    it('should use semicolon delimiter when specified', () => {
      const result = formatSimpleCSV(
        ['col1', 'col2'],
        [['val1', 'val2']],
        { delimiter: ';', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"col1";"col2"\n"val1";"val2"')
    })

    it('should use tab delimiter when specified', () => {
      const result = formatSimpleCSV(
        ['col1', 'col2'],
        [['val1', 'val2']],
        { delimiter: '\t', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"col1"\t"col2"\n"val1"\t"val2"')
    })
  })

  describe('line ending options', () => {
    it('should use CRLF by default', () => {
      const result = formatSimpleCSV(
        ['col1'],
        [['val1']],
        { includeBOM: false }
      )
      expect(result).toBe('"col1"\r\n"val1"')
    })

    it('should use CRLF when specified', () => {
      const result = formatSimpleCSV(
        ['col1'],
        [['val1']],
        { includeBOM: false, lineEnding: 'CRLF' }
      )
      expect(result).toBe('"col1"\r\n"val1"')
    })

    it('should use LF when specified', () => {
      const result = formatSimpleCSV(
        ['col1'],
        [['val1']],
        { includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"col1"\n"val1"')
    })
  })

  describe('UTF-8 BOM', () => {
    it('should include BOM by default', () => {
      const result = formatSimpleCSV(
        ['col1'],
        [['val1']],
        { lineEnding: 'LF' }
      )
      expect(result.startsWith('\uFEFF')).toBe(true)
    })

    it('should include BOM when explicitly set to true', () => {
      const result = formatSimpleCSV(
        ['col1'],
        [['val1']],
        { includeBOM: true, lineEnding: 'LF' }
      )
      expect(result.startsWith('\uFEFF')).toBe(true)
    })

    it('should not include BOM when set to false', () => {
      const result = formatSimpleCSV(
        ['col1'],
        [['val1']],
        { includeBOM: false, lineEnding: 'LF' }
      )
      expect(result.startsWith('\uFEFF')).toBe(false)
    })
  })

  describe('complex scenarios', () => {
    it('should handle multiple rows with various data types', () => {
      const result = formatSimpleCSV(
        ['id', 'name', 'collection_date', 'count'],
        [
          [123, 'John Doe', '2024-01-15', 5],
          [456, 'Jane "Smith"', '2024-02-20', 10],
        ],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      
      // Check headers are escaped
      expect(result).toContain('"id","name","collection_date","count"')
      
      // Check first row
      const row1 = result.split('\n')[1]
      expect(row1).toContain('"=""123"""') // id formatted as Excel text
      expect(row1).toContain('"John Doe"')
      expect(row1).toContain('2024-01-15')
      expect(row1).toContain('"5"') // count is numeric but still quoted
      
      // Check second row
      expect(result).toContain('"=""456"""')
      expect(result).toContain('"Jane ""Smith"""') // quotes escaped
    })

    it('should handle cells with equals sign at start (not Excel format)', () => {
      const result = formatSimpleCSV(
        ['formula'],
        [['=SUM(A1:A10)']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      // Should be quoted normally, not treated as Excel text format
      expect(result).toContain('"=SUM(A1:A10)"')
    })

    it('should handle very long numeric IDs', () => {
      const result = formatSimpleCSV(
        ['id'],
        [['12345678901234567890']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      const rows = result.split('\n')
      expect(rows[1]).toBe('"=""12345678901234567890"""')
    })

    it('should handle leading zeros in numeric IDs', () => {
      const result = formatSimpleCSV(
        ['id'],
        [['00123']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      const rows = result.split('\n')
      expect(rows[1]).toBe('"=""00123"""')
    })
  })

  describe('edge cases', () => {
    it('should handle empty headers array', () => {
      const result = formatSimpleCSV(
        [],
        [],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('')
    })

    it('should handle empty rows array', () => {
      const result = formatSimpleCSV(
        ['col1', 'col2'],
        [],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"col1","col2"')
    })

    it('should handle rows with fewer columns than headers', () => {
      const result = formatSimpleCSV(
        ['col1', 'col2', 'col3'],
        [['val1', 'val2']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"col1","col2","col3"\n"val1","val2",""')
    })

    it('should handle rows with more columns than headers', () => {
      const result = formatSimpleCSV(
        ['col1', 'col2'],
        [['val1', 'val2', 'val3']],
        { delimiter: ',', includeBOM: false, lineEnding: 'LF' }
      )
      expect(result).toBe('"col1","col2"\n"val1","val2"')
    })
  })
})

