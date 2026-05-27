import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import Dashboard from '../Dashboard'

vi.mock('../../lib/api/client', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('client', dashboardPageMock())
})

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('studies', dashboardPageMock())
})

vi.mock('../../lib/api/search', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('search', dashboardPageMock())
})

vi.mock('../../lib/api/statistics', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('statistics', dashboardPageMock())
})

vi.mock('../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('controls', dashboardPageMock())
})

vi.mock('../../lib/api/qpcr', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('qpcr', dashboardPageMock())
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
