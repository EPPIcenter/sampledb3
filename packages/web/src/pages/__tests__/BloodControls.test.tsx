import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import BloodControls from '../BloodControls'

vi.mock('../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bloodControlsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('controls', bloodControlsPageMock())
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bloodControlsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reference-data', bloodControlsPageMock())
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('BloodControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Definitions or Batches tab content', async () => {
    await render(<BloodControls />)
    await waitFor(
      () => {
        const tabs = screen.getAllByText(/definitions|batches/i)
        expect(tabs.length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  it('highlights Compositions tab when no search params', async () => {
    await render(<BloodControls />, { initialEntries: ['/blood-controls'] })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /compositions/i })).toBeInTheDocument()
    })
    const compositionsTab = screen.getByRole('button', { name: /compositions/i })
    expect(compositionsTab).toHaveClass('blood-controls-tab-active')
  })

  it('highlights Control Batches tab when tab=batches', async () => {
    await render(<BloodControls />, { initialEntries: ['/blood-controls?tab=batches'] })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /control batches/i })).toBeInTheDocument()
    })
    const batchesTab = screen.getByRole('button', { name: /control batches/i })
    expect(batchesTab).toHaveClass('blood-controls-tab-active')
  })

  it('highlights Compositions tab when tab=definitions', async () => {
    await render(<BloodControls />, { initialEntries: ['/blood-controls?tab=definitions'] })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /compositions/i })).toBeInTheDocument()
    })
    const compositionsTab = screen.getByRole('button', { name: /compositions/i })
    expect(compositionsTab).toHaveClass('blood-controls-tab-active')
  })
})
