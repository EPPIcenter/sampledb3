import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '../../__tests__/helpers/render'
import { waitFor } from '@testing-library/react'
import type { AxiosResponse } from 'axios'
import SetupGuard from '../SetupGuard'
import { setupApi } from '../../lib/api'

function createStatusResponse(initialized: boolean): AxiosResponse<{ initialized: boolean }> {
  return {
    data: { initialized },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as AxiosResponse['config'],
  }
}

vi.mock('../../lib/api', () => ({
  setupApi: {
    status: vi.fn().mockResolvedValue({
      data: { initialized: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as AxiosResponse<{ initialized: boolean }>['config'],
    } as AxiosResponse<{ initialized: boolean }>),
  },
}))

describe('SetupGuard', () => {
  beforeEach(() => {
    vi.mocked(setupApi.status).mockResolvedValue(createStatusResponse(true))
  })

  it('shows loading state initially', async () => {
    // Deferred promise so loading state is still visible after render's microtask flush
    let resolveStatus: (v: AxiosResponse<{ initialized: boolean }>) => void
    const statusPromise = new Promise<AxiosResponse<{ initialized: boolean }>>((r) => {
      resolveStatus = r
    })
    vi.mocked(setupApi.status).mockReturnValueOnce(statusPromise)

    await render(
      <SetupGuard>
        <div>Protected content</div>
      </SetupGuard>
    )
    expect(screen.getByText(/checking setup status/i)).toBeInTheDocument()
    await act(async () => {
      resolveStatus!(createStatusResponse(true))
      await Promise.resolve()
    })
  })

  it('renders children after setup is initialized', async () => {
    await render(
      <SetupGuard>
        <div>Protected content</div>
      </SetupGuard>
    )

    await waitFor(() => {
      expect(screen.getByText('Protected content')).toBeInTheDocument()
    })
  })
})
