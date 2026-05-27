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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] }
})

describe('BloodControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows blood controls content', async () => {
    await render(<BloodControls />)
    const heading = await screen.findByRole('heading', { name: /blood controls management/i })
    expect(heading).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Total Definitions')).toBeInTheDocument()
    })
  })
})
