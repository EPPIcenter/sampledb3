import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import ContainerTypeUnitsManager from '../ContainerTypeUnitsManager'
import { settingsApi } from '../../lib/api/settings'
import { unitsApi } from '../../lib/api/reference-data'

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    settingsApi: {
      getValue: vi.fn(),
      getContainerTypeUnits: vi.fn(),
      addContainerTypeUnit: vi.fn(),
      removeContainerTypeUnit: vi.fn(),
    },
  })
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', { unitsApi: { listAll: vi.fn() } })
})

describe('ContainerTypeUnitsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(unitsApi.listAll).mockResolvedValue([{ id: 1, symbol: 'uL', name: 'microliter', category: 'volume' }])
    vi.mocked(settingsApi.getValue).mockResolvedValue(null)
    vi.mocked(settingsApi.getContainerTypeUnits).mockResolvedValue({ units: [] } as never)
  })

  it('loads on mount, and reloads after a failed toggle', async () => {
    vi.mocked(settingsApi.addContainerTypeUnit).mockRejectedValue(new Error('nope'))
    const onError = vi.fn()
    await render(<ContainerTypeUnitsManager onError={onError} />)
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))
    expect(unitsApi.listAll).toHaveBeenCalledTimes(1)

    await userEvent.setup().click(screen.getAllByRole('checkbox')[0]!)

    await waitFor(() => expect(unitsApi.listAll).toHaveBeenCalledTimes(2))
    expect(onError).toHaveBeenCalledWith('Failed to update unit relationship')
  })
})
