import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Routes, Route, useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { render, screen, act } from '../../__tests__/helpers/render'
import { waitFor } from '@testing-library/react'
import SetupGuard from '../SetupGuard'
import { setupApi } from '../../lib/api/settings'
import { invalidateAfterBulkWrite } from '../../lib/query-client'

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    setupApi: {
      status: vi.fn().mockResolvedValue({ initialized: true }),
    },
  })
})

function StatefulChild() {
  const [count, setCount] = useState(0)
  return (
    <div data-testid="stateful-child">
      <span>Count: {count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </div>
  )
}

function SetupPageWithLeaveButton() {
  const navigate = useNavigate()
  return (
    <div>
      <span>Setup page</span>
      <button type="button" onClick={() => navigate('/login')}>
        Leave setup
      </button>
    </div>
  )
}

describe('SetupGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('keeps children mounted with the same DOM node and local state across a background refetch', async () => {
    const user = userEvent.setup()
    const { queryClient } = await render(
      <SetupGuard>
        <StatefulChild />
      </SetupGuard>,
      { initialEntries: ['/import'] },
    )

    const childNode = await screen.findByTestId('stateful-child')
    await user.click(screen.getByRole('button', { name: 'Increment' }))
    expect(screen.getByText('Count: 1')).toBeInTheDocument()

    let resolveRefetch!: (v: { initialized: boolean }) => void
    vi.mocked(setupApi.status).mockReturnValueOnce(
      new Promise<{ initialized: boolean }>((resolve) => {
        resolveRefetch = resolve
      }),
    )

    let invalidatePromise!: Promise<void>
    await act(async () => {
      invalidatePromise = invalidateAfterBulkWrite(queryClient)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(setupApi.status).toHaveBeenCalledTimes(2)
    })

    // While the background refetch is in flight, children stay mounted and no spinner replaces them.
    expect(screen.queryByText(/checking setup status/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('stateful-child')).toBe(childNode)
    expect(screen.getByText('Count: 1')).toBeInTheDocument()

    await act(async () => {
      resolveRefetch({ initialized: true })
      await invalidatePromise
    })

    expect(screen.getByTestId('stateful-child')).toBe(childNode)
    expect(screen.getByText('Count: 1')).toBeInTheDocument()
  })

  it('holds the app while re-checking setup status when leaving /setup', async () => {
    const user = userEvent.setup()
    vi.mocked(setupApi.status).mockResolvedValueOnce({ initialized: false })

    await render(
      <SetupGuard>
        <Routes>
          <Route path="/setup" element={<SetupPageWithLeaveButton />} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </SetupGuard>,
      { initialEntries: ['/setup'] },
    )

    expect(await screen.findByText('Setup page')).toBeInTheDocument()

    let resolveRecheck!: (v: { initialized: boolean }) => void
    vi.mocked(setupApi.status).mockReturnValueOnce(
      new Promise<{ initialized: boolean }>((resolve) => {
        resolveRecheck = resolve
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Leave setup' }))

    expect(await screen.findByText(/checking setup status/i)).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()

    await act(async () => {
      resolveRecheck({ initialized: true })
      await Promise.resolve()
    })

    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  it('redirects to /setup when a background refetch reports the system is not initialized', async () => {
    const { queryClient } = await render(
      <SetupGuard>
        <Routes>
          <Route path="/setup" element={<div>Setup page</div>} />
          <Route path="/import" element={<div>Import page</div>} />
        </Routes>
      </SetupGuard>,
      { initialEntries: ['/import'] },
    )

    expect(await screen.findByText('Import page')).toBeInTheDocument()

    vi.mocked(setupApi.status).mockResolvedValueOnce({ initialized: false })
    await act(async () => {
      await invalidateAfterBulkWrite(queryClient)
    })

    expect(await screen.findByText('Setup page')).toBeInTheDocument()
  })
})
