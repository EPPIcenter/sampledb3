import { describe, it, expect } from 'vitest'
import { qpcrResultsUploadMessage } from '../qpcr-results-upload-message'

describe('qpcrResultsUploadMessage', () => {
  it('reports what was stored when nothing was skipped', () => {
    expect(
      qpcrResultsUploadMessage({
        run: { id: 1 },
        wellResultCount: 96,
        amplificationCount: 0,
        skippedAmplification: { rowCount: 0, wellPositions: [] },
      }),
    ).toBe('Imported 96 well results and 0 amplification rows.')
  })

  it('reports skipped amplification rows, why, and which wells', () => {
    expect(
      qpcrResultsUploadMessage({
        run: { id: 1 },
        wellResultCount: 46,
        amplificationCount: 2760,
        skippedAmplification: { rowCount: 3000, wellPositions: ['G06', 'H06'] },
      }),
    ).toBe(
      'Imported 46 well results and 2,760 amplification rows. Skipped 3,000 amplification rows from 2 wells with no result in the file (empty wells): G06, H06.',
    )
  })
})
