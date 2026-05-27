import { describe, it, expect, vi, beforeEach } from 'vitest'
import { settingsApi } from '../../../lib/api/settings'
import { api } from '../../../lib/api/client'
import { ApiContractError } from '../../../lib/api/parse-response'
import {
  settingsGetEnvelope,
  scannerConfigurationsValue,
  mockSettingsApiGetValue,
} from '../settings-mocks'

vi.mock('../../../lib/api/client', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../../../lib/api/settings', async (importOriginal) =>
  importOriginal<typeof import('../../../lib/api/settings')>(),
)

describe('settings mock helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('settingsGetEnvelope', () => {
    it('matches GET /settings/:key wire shape used by getValue', async () => {
      const configs = scannerConfigurationsValue([
        {
          id: 'x',
          name: 'X',
          barcodeColumn: 'bc',
          positionType: 'single',
          skipRows: 0,
        },
      ])
      vi.mocked(api.get).mockResolvedValue(
        settingsGetEnvelope('scanner_configurations', configs),
      )

      const result = await settingsApi.getValue('scanner_configurations')

      expect(result?.configurations).toHaveLength(1)
      expect(result?.configurations[0]?.id).toBe('x')
    })

    it('throws when api.get returns bare configuration object (envelope contract)', async () => {
      vi.mocked(api.get).mockResolvedValue({ configurations: [] })

      await expect(settingsApi.getValue('scanner_configurations')).rejects.toThrow(
        ApiContractError,
      )
    })
  })

  describe('mockSettingsApiGetValue', () => {
    it('returns shared and personal export lists by scope', async () => {
      const getValue = mockSettingsApiGetValue({
        exportShared: { configurations: [{ name: 'Shared', columns: ['id'] }] },
        exportPersonal: { configurations: [{ name: 'Mine', columns: ['barcode'] }] },
      })

      const shared = await getValue('export_configurations', { scope: 'shared' })
      const personal = await getValue('export_configurations', { scope: 'personal' })

      expect(shared?.configurations[0]?.name).toBe('Shared')
      expect(personal?.configurations[0]?.name).toBe('Mine')
    })
  })
})
