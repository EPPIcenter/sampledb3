import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import Dashboard from '../Dashboard'

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedApi(dashboardPageMock())
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('eventually shows dashboard content or metrics', async () => {
    await render(<Dashboard />)
    await vi.waitFor(() => {
      const el = screen.queryByRole('main') ?? document.querySelector('[class*="dashboard"]')
      expect(el).toBeTruthy()
    }, { timeout: 3000 })
  })
})
