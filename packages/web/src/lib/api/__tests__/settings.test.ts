import { describe, it, expect, vi, beforeEach } from 'vitest'
import { settingsApi } from '../settings'
import { api } from '../client'

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
  },
}))

describe('settingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getValue', () => {
    it('returns value from GET /settings/:key envelope', async () => {
      vi.mocked(api.get).mockResolvedValue({
        key: 'scanner_configurations',
        value: {
          configurations: [{ id: 'traxcer', name: 'Traxcer', barcodeColumn: 'Tube ID', positionType: 'single', skipRows: 0 }],
        },
      })

      const result = await settingsApi.getValue('scanner_configurations')

      expect(api.get).toHaveBeenCalledWith('/settings/scanner_configurations')
      expect(result?.configurations).toHaveLength(1)
      expect(result?.configurations[0]?.id).toBe('traxcer')
    })

    it('can return null when setting value is null', async () => {
      vi.mocked(api.get).mockResolvedValue({
        key: 'scanner_configurations',
        value: null,
      })

      const result = await settingsApi.getValue('scanner_configurations')
      expect(result).toBeNull()
    })
  })
})
