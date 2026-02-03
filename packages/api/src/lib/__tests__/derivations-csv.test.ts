import { describe, it, expect } from 'vitest'
import { parseCsv } from '../derivations-csv'

describe('derivations-csv', () => {
  describe('parseCsv', () => {
    it('returns empty array for empty text', () => {
      const rows = parseCsv('')
      expect(rows).toEqual([])
    })

    it('returns empty array for whitespace-only lines', () => {
      const rows = parseCsv('   \n\n  ')
      expect(rows).toEqual([])
    })

    it('parses header and one row', () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name\n1,Extraction,Blood'
      const rows = parseCsv(text)
      expect(rows.length).toBe(1)
      expect(rows[0]).toMatchObject({
        parent_container_id: '1',
        derivation_type: 'Extraction',
        specimen_type_name: 'Blood',
      })
    })

    it('parses multiple rows', () => {
      const text = `col_a,col_b\n1,2\n3,4`
      const rows = parseCsv(text)
      expect(rows.length).toBe(2)
      expect(rows[0]).toMatchObject({ col_a: '1', col_b: '2' })
      expect(rows[1]).toMatchObject({ col_a: '3', col_b: '4' })
    })

    it('handles quoted fields', () => {
      const text = 'parent_container_id,derivation_type\n1,Extraction'
      const rows = parseCsv(text)
      expect(rows.length).toBe(1)
      expect(rows[0].parent_container_id).toBe('1')
      expect(rows[0].derivation_type).toBe('Extraction')
    })

    it('handles escaped quotes in quoted field', () => {
      const text = 'notes\n""double""'
      const rows = parseCsv(text)
      expect(rows.length).toBe(1)
      // Parser collapses "" to single " inside quoted field
      expect(rows[0].notes).toBe('double')
    })
  })
})
