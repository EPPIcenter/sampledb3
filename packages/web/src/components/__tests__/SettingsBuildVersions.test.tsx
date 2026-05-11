import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '../../__tests__/helpers/render'
import { SettingsBuildVersions } from '../SettingsBuildVersions'

describe('SettingsBuildVersions', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('shows web build id and API build id after fetch succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ buildId: 'abc123deploy' }),
    } as Response)

    await render(<SettingsBuildVersions />)

    expect(screen.getByLabelText(/Application build identifiers/i)).toBeInTheDocument()
    expect(screen.getByTitle('local-dev')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('abc123deploy')).toBeInTheDocument()
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/app-version',
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
    )
  })

  it('shows unavailable when app-version fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'))

    await render(<SettingsBuildVersions />)

    await waitFor(() => {
      expect(screen.getByText('unavailable')).toBeInTheDocument()
    })
  })
})
