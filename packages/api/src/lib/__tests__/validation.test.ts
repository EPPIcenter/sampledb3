import { describe, it, expect } from 'vitest'
import { validateCollectionDate, checkDuplicateSpecimens } from '../validation'

describe('validation', () => {
  describe('validateCollectionDate', () => {
    const localDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    it('returns valid when date is undefined or blank (optional)', () => {
      expect(validateCollectionDate(undefined)).toEqual({ valid: true, normalized: undefined })
      expect(validateCollectionDate('  ')).toEqual({ valid: true, normalized: undefined })
    })

    it('returns a past ISO date unchanged', () => {
      expect(validateCollectionDate('2020-01-01')).toEqual({ valid: true, normalized: '2020-01-01' })
    })

    it('normalizes common forms to YYYY-MM-DD', () => {
      for (const [input, expected] of [
        ['2024-1-5', '2024-01-05'],
        ['2024/01/05', '2024-01-05'],
        ['1/5/2024', '2024-01-05'],
        ['01/05/2024', '2024-01-05'],
        ['2024-01-05T10:30:00Z', '2024-01-05'],
        [' 2024-01-05 ', '2024-01-05'],
      ]) {
        expect(validateCollectionDate(input)).toEqual({ valid: true, normalized: expected })
      }
    })

    it('rejects impossible dates and unrecognized text', () => {
      for (const input of ['2024-02-30', '13/01/2024', 'hello 2024', 'not-a-date', '1/5/24', '20240105']) {
        const result = validateCollectionDate(input)
        expect(result.valid).toBe(false)
      }
    })

    it('returns valid for today (edge)', () => {
      const today = localDate(new Date())
      expect(validateCollectionDate(today)).toEqual({ valid: true, normalized: today })
    })

    it('returns invalid when date is in the future', () => {
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      expect(validateCollectionDate(localDate(future))).toEqual({
        valid: false,
        error: 'Collection date cannot be in the future',
      })
    })
  })

  describe('checkDuplicateSpecimens', () => {
    it('returns empty array when no duplicates', () => {
      const specimens = [
        { sourceType: 'subject', studyShortCode: 'S1', subjectName: 'Subj1', specimenTypeName: 'Blood', collectionDate: '2024-01-01' },
        { sourceType: 'subject', studyShortCode: 'S1', subjectName: 'Subj2', specimenTypeName: 'Blood', collectionDate: '2024-01-01' },
      ]
      expect(checkDuplicateSpecimens(specimens)).toEqual([])
    })

    it('returns errors for duplicate entries (same source + type + date)', () => {
      const specimens = [
        { sourceType: 'subject', studyShortCode: 'S1', subjectName: 'Subj1', specimenTypeName: 'Blood', collectionDate: '2024-01-01' },
        { sourceType: 'subject', studyShortCode: 'S1', subjectName: 'Subj1', specimenTypeName: 'Blood', collectionDate: '2024-01-01' },
      ]
      const errors = checkDuplicateSpecimens(specimens)
      expect(errors.length).toBe(1)
      expect(errors[0]).toEqual({ index: 1, error: 'Duplicate specimen entry' })
    })

    it('identifies multiple duplicates', () => {
      const specimens = [
        { sourceType: 'subject', sourceId: 1, specimenTypeId: 1, collectionDate: '2024-01-01' },
        { sourceType: 'subject', sourceId: 1, specimenTypeId: 1, collectionDate: '2024-01-01' },
        { sourceType: 'subject', sourceId: 1, specimenTypeId: 1, collectionDate: '2024-01-01' },
      ]
      const errors = checkDuplicateSpecimens(specimens)
      expect(errors.length).toBe(2)
      expect(errors.map((e) => e.index)).toEqual([1, 2])
    })
  })
})
