import { describe, expect, it } from 'vitest'
import { formatDerivationType } from '../derivation-types'

describe('formatDerivationType', () => {
  it('maps stored values to UI labels', () => {
    expect(formatDerivationType('aliquot')).toBe('Distribution')
    expect(formatDerivationType('dna_extraction')).toBe('DNA Extraction')
  })

  it('humanizes unknown values', () => {
    expect(formatDerivationType('spot')).toBe('Spot')
  })
})
