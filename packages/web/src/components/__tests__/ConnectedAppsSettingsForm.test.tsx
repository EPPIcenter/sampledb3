import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import ConnectedAppsSettingsForm from '../ConnectedAppsSettingsForm'
import { settingsApi } from '../../lib/api/settings'

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    settingsApi: {
      update: vi.fn().mockResolvedValue({ enabled: true }),
    },
  })
})

describe('ConnectedAppsSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.update).mockResolvedValue({ enabled: true } as never)
  })

  it('defaults to off and explains what turning Connected apps on allows', async () => {
    await render(<ConnectedAppsSettingsForm data={null} />)

    const toggle = screen.getByRole('switch', { name: /enable connected apps/i })
    expect(toggle).not.toBeChecked()
    expect(screen.getByText(/claude code/i)).toBeInTheDocument()
    expect(screen.getByText(/capped at member/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /saved/i })).toBeDisabled()
  })

  it('enables Connected apps and calls onSuccess when toggled and saved', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()

    await render(<ConnectedAppsSettingsForm data={{ enabled: false }} onSuccess={onSuccess} />)

    const toggle = screen.getByRole('switch', { name: /enable connected apps/i })
    expect(toggle).not.toBeChecked()

    await user.click(toggle)
    expect(toggle).toBeChecked()

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton).toBeEnabled()
    await user.click(saveButton)

    await waitFor(() => {
      expect(settingsApi.update).toHaveBeenCalledWith('connected_apps', { enabled: true })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('shows saving state while the update request is in flight', async () => {
    const user = userEvent.setup()
    let resolveSave!: (value: { enabled: boolean }) => void
    vi.mocked(settingsApi.update).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve as (value: { enabled: boolean }) => void
        }) as never,
    )

    await render(<ConnectedAppsSettingsForm data={{ enabled: false }} />)

    await user.click(screen.getByRole('switch', { name: /enable connected apps/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const savingButton = screen.getByRole('button', { name: /saving/i })
    expect(savingButton).toBeDisabled()

    resolveSave({ enabled: true })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saved/i })).toBeDisabled()
    })
  })

  it('reports error via onError when saving fails', async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    vi.mocked(settingsApi.update).mockRejectedValue({
      response: { data: { error: 'Admin access required' } },
    })

    await render(<ConnectedAppsSettingsForm data={{ enabled: true }} onError={onError} />)

    const toggle = screen.getByRole('switch', { name: /enable connected apps/i })
    expect(toggle).toBeChecked()

    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Admin access required')
    })
  })
})
