import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import Locations from '../Locations'

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { locationsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('locations', locationsPageMock())
})

vi.mock('../../lib/api/search', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { locationsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('search', locationsPageMock())
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: { id: 1, name: 'Test', email: 'test@test.com', role: 'member' },
      loading: false,
      canManageReferenceData: false,
    }),
  }
})

import { locationsApi } from '../../lib/api/locations'

describe('Locations page', () => {
  beforeEach(() => {
    vi.mocked(locationsApi.list).mockResolvedValue({
      data: { locations: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    })
  })

  it('renders location list or tree', async () => {
    await render(<Locations />)
    const headings = await screen.findAllByText(/Locations|Storage/i)
    expect(headings.length).toBeGreaterThan(0)
  })

  it('shows locations when API returns list', async () => {
    vi.mocked(locationsApi.list).mockResolvedValue({
      data: {
        locations: [
          {
            id: 1,
            name: 'Freezer A',
            parentId: null,
            storageTypeId: null,
            path: 'Freezer A',
            canContainCollections: true,
            created: '',
            lastUpdated: '',
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    })
    await render(<Locations />)
    const freezerElements = await screen.findAllByText('Freezer A', {}, { timeout: 3000 })
    expect(freezerElements.length).toBeGreaterThan(0)
  })

  it('calls locationsApi.list on mount', async () => {
    await render(<Locations />)
    expect(locationsApi.list).toHaveBeenCalled()
  })
})
