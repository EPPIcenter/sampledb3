import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '../../__tests__/helpers/render'
import { waitFor } from '@testing-library/react'
import SetupGuard from '../SetupGuard'
import { setupApi } from '../../lib/api/settings'

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    setupApi: {
      status: vi.fn().mockResolvedValue({ initialized: true }),
    },
  })
})

describe('SetupGuard', () => {
  beforeEach(() => {
    vi.mocked(setupApi.status).mockResolvedValue({ initialized: true })
  })

  it('shows loading state initially', async () => {
    let resolveStatus: (v: { initialized: boolean }) => void
    const statusPromise = new Promise<{ initialized: boolean }>((r) => {
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
      resolveStatus!({ initialized: true })
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

  it('shows PageError with retry when status check fails', async () => {
    vi.mocked(setupApi.status).mockRejectedValueOnce(new Error('Network error'))

    await render(
      <SetupGuard>
        <div>Protected content</div>
      </SetupGuard>
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })
})
