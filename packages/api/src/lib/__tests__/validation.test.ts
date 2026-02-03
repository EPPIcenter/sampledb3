import { describe, it, expect } from 'vitest'
import { validateCollectionDate, checkDuplicateSpecimens } from '../validation'

describe('validation', () => {
  describe('validateCollectionDate', () => {
    it('returns valid when date is undefined (optional)', () => {
      expect(validateCollectionDate(undefined)).toEqual({ valid: true })
    })

    it('returns valid for past date string', () => {
      const past = '2020-01-01'
      expect(validateCollectionDate(past)).toEqual({ valid: true })
    })

    it('returns valid for today (edge)', () => {
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      expect(validateCollectionDate(todayStr)).toEqual({ valid: true })
    })

    it('returns invalid for invalid date format', () => {
      expect(validateCollectionDate('not-a-date')).toEqual({
        valid: false,
        error: 'Invalid date format',
      })
    })

    it('returns invalid when date is in the future', () => {
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      const futureStr = future.toISOString().split('T')[0]
      expect(validateCollectionDate(futureStr)).toEqual({
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
