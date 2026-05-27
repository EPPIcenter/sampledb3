import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  settingsApi,
  exportConfigurationsApi,
  scannerConfigurationsApi,
  tableViewConfigurationsApi,
} from '../settings'
import { api } from '../client'
import { ApiContractError } from '../parse-response'
import { settingsGetEnvelope, settingsPutEnvelope } from '../../../__tests__/helpers/settings-mocks'

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

// Use real settings module (global setup mocks settings with importActual + auth defaults only).
vi.mock('../settings', async (importOriginal) => importOriginal<typeof import('../settings')>())

describe('settingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getValue', () => {
    it('returns value from GET /settings/:key envelope', async () => {
      vi.mocked(api.get).mockResolvedValue(
        settingsGetEnvelope('scanner_configurations', {
          configurations: [
            {
              id: 'traxcer',
              name: 'Traxcer',
              barcodeColumn: 'Tube ID',
              positionType: 'single',
              skipRows: 0,
            },
          ],
        }),
      )

      const result = await settingsApi.getValue('scanner_configurations')

      expect(api.get).toHaveBeenCalledWith('/settings/scanner_configurations')
      expect(result?.configurations).toHaveLength(1)
      expect(result?.configurations[0]?.id).toBe('traxcer')
    })

    it('passes scope query for shared export configurations', async () => {
      vi.mocked(api.get).mockResolvedValue(
        settingsGetEnvelope('export_configurations', {
          configurations: [{ name: 'CSV', columns: ['id'] }],
        }),
      )

      const result = await settingsApi.getValue('export_configurations', { scope: 'shared' })

      expect(api.get).toHaveBeenCalledWith('/settings/export_configurations?scope=shared')
      expect(result?.configurations).toHaveLength(1)
    })

    it('throws ApiContractError when response is not an envelope', async () => {
      vi.mocked(api.get).mockResolvedValue({ configurations: [] })

      await expect(settingsApi.getValue('scanner_configurations')).rejects.toThrow(
        ApiContractError,
      )
    })

    it('can return null when setting value is null', async () => {
      vi.mocked(api.get).mockResolvedValue(
        settingsGetEnvelope('scanner_configurations', null),
      )

      const result = await settingsApi.getValue('scanner_configurations')
      expect(result).toBeNull()
    })
  })

  describe('putValue', () => {
    it('returns value from PUT /settings/:key envelope', async () => {
      const payload = {
        configurations: [{ name: 'Default', columns: ['specimen_id'], isDefault: true }],
      }
      vi.mocked(api.put).mockResolvedValue(
        settingsPutEnvelope('export_configurations', payload, null),
      )

      const result = await settingsApi.putValue('export_configurations', payload, null)

      expect(api.put).toHaveBeenCalledWith('/settings/export_configurations', {
        ...payload,
        userId: null,
      })
      expect(result).toEqual(payload)
    })
  })

  describe('update', () => {
    it('delegates to putValue and returns unwrapped value', async () => {
      const payload = { defaultPageSize: 25, maxPageSize: 100 }
      vi.mocked(api.put).mockResolvedValue(
        settingsPutEnvelope('pagination_settings', payload, 1),
      )

      const result = await settingsApi.update('pagination_settings', payload)

      expect(api.put).toHaveBeenCalledWith('/settings/pagination_settings', {
        ...payload,
        userId: undefined,
      })
      expect(result).toEqual(payload)
    })
  })
})

describe('configuration settings updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exportConfigurationsApi.update unwraps PUT envelope', async () => {
    const payload = { configurations: [{ name: 'CSV', columns: ['id'] }] }
    vi.mocked(api.put).mockResolvedValue(settingsPutEnvelope('export_configurations', payload))

    const result = await exportConfigurationsApi.update(payload, null)

    expect(result).toEqual(payload)
  })

  it('scannerConfigurationsApi.update unwraps PUT envelope', async () => {
    const payload = {
      configurations: [
        {
          id: 'traxcer',
          name: 'Traxcer',
          barcodeColumn: 'Tube ID',
          positionType: 'single' as const,
          skipRows: 0,
        },
      ],
    }
    vi.mocked(api.put).mockResolvedValue(settingsPutEnvelope('scanner_configurations', payload))

    const result = await scannerConfigurationsApi.update(payload, null)

    expect(result).toEqual(payload)
  })

  it('tableViewConfigurationsApi.update unwraps PUT envelope', async () => {
    const payload = { configurations: [{ name: 'Default', columns: ['specimen_id'] }] }
    vi.mocked(api.put).mockResolvedValue(settingsPutEnvelope('table_view_configurations', payload))

    const result = await tableViewConfigurationsApi.update(payload)

    expect(result).toEqual(payload)
  })
})
