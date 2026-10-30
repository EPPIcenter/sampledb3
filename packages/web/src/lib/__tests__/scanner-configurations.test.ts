import { describe, it, expect } from 'vitest'
import { defaultScannerConfiguration } from '../scanner-configurations'

describe('defaultScannerConfiguration', () => {
  it('picks the configuration marked default', () => {
    expect(defaultScannerConfiguration([{ id: 'a' }, { id: 'b', isDefault: true }])?.id).toBe('b')
  })

  it('falls back to the first configuration', () => {
    expect(defaultScannerConfiguration([{ id: 'a', isDefault: false }, { id: 'b' }])?.id).toBe('a')
  })

  it('returns undefined for no configurations', () => {
    expect(defaultScannerConfiguration([])).toBeUndefined()
  })
})
