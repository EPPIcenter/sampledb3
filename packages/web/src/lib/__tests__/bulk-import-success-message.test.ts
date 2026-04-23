import { describe, it, expect } from 'vitest'
import {
  formatBulkImportSuccessMessage,
  hasBulkImportErrorWithNoProgress,
  type BulkImportResultForMessage,
} from '../bulk-import-success-message'

const base: BulkImportResultForMessage = { success: true }

describe('hasBulkImportErrorWithNoProgress', () => {
  it('is true for combined with errors and all zero summary', () => {
    expect(
      hasBulkImportErrorWithNoProgress(
        {
          ...base,
          success: false,
          errors: [{ index: 0, error: 'x' }],
          combinedSummary: {
            subjectsCreated: 0,
            subjectsUpdated: 0,
            specimensCreated: 0,
            containersCreated: 0,
          },
        },
        'combined',
      ),
    ).toBe(true)
  })

  it('is false for combined with errors if subjectsUpdated > 0', () => {
    expect(
      hasBulkImportErrorWithNoProgress(
        {
          ...base,
          success: false,
          errors: [{ index: 0, error: 'x' }],
          combinedSummary: {
            subjectsCreated: 0,
            subjectsUpdated: 1,
            specimensCreated: 0,
            containersCreated: 0,
          },
        },
        'combined',
      ),
    ).toBe(false)
  })
})

describe('formatBulkImportSuccessMessage', () => {
  it('returns error copy when all failed with no progress (combined)', () => {
    const msg = formatBulkImportSuccessMessage(
      {
        success: false,
        errors: [{ index: 0, error: 'x' }],
        combinedSummary: {
          subjectsCreated: 0,
          subjectsUpdated: 0,
          specimensCreated: 0,
          containersCreated: 0,
        },
      },
      'combined',
    )
    expect(msg).toContain('No items were created')
  })

  it('formats per-type created counts for combined', () => {
    const msg = formatBulkImportSuccessMessage(
      {
        success: true,
        combinedSummary: {
          subjectsCreated: 1,
          subjectsUpdated: 0,
          specimensCreated: 2,
          containersCreated: 3,
        },
      },
      'combined',
    )
    expect(msg).toMatch(/Created:/)
    expect(msg).toContain('1 new subject')
    expect(msg).toContain('2 specimens')
    expect(msg).toContain('3 containers')
  })

  it('appends match line for subjectsUpdated', () => {
    const msg = formatBulkImportSuccessMessage(
      {
        success: true,
        combinedSummary: {
          subjectsCreated: 0,
          subjectsUpdated: 1,
          specimensCreated: 2,
          containersCreated: 0,
        },
      },
      'combined',
    )
    expect(msg).toContain('Created:')
    expect(msg).toContain('2 specimens')
    expect(msg).toContain('1 existing subject was matched')
  })

  it('pluralises subjectsUpdated', () => {
    const msg = formatBulkImportSuccessMessage(
      {
        success: true,
        combinedSummary: {
          subjectsCreated: 0,
          subjectsUpdated: 2,
          specimensCreated: 0,
          containersCreated: 0,
        },
      },
      'combined',
    )
    expect(msg).toContain('2 existing subjects were matched')
  })

  it('all zeros without errors: no new records', () => {
    const msg = formatBulkImportSuccessMessage(
      {
        success: true,
        combinedSummary: {
          subjectsCreated: 0,
          subjectsUpdated: 0,
          specimensCreated: 0,
          containersCreated: 0,
        },
      },
      'combined',
    )
    expect(msg).toBe('No new records were created.')
  })

  it('subjects mode uses subject wording', () => {
    expect(formatBulkImportSuccessMessage({ success: true, created: 1 }, 'subjects')).toContain('1 subject')
    expect(formatBulkImportSuccessMessage({ success: true, created: 3 }, 'subjects')).toContain('3 subjects')
  })

  it('specimens with containers lists both', () => {
    const msg = formatBulkImportSuccessMessage(
      { success: true, created: 4, containersCreated: 1 },
      'specimens',
    )
    expect(msg).toContain('4 specimens')
    expect(msg).toContain('1 container')
  })

  it('specimens with no containers: specimens only', () => {
    const msg = formatBulkImportSuccessMessage({ success: true, created: 5, containersCreated: 0 }, 'specimens')
    expect(msg).toBe('Created: 5 specimens.')
  })
})
