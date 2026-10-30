import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
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
import { searchApi, type SearchResponse, type SearchResult } from '../../lib/api/search'

describe('Locations page', () => {
  beforeEach(() => {
    vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] })
  })

  it('renders location list or tree', async () => {
    await render(<Locations />)
    const headings = await screen.findAllByText(/Locations|Storage/i)
    expect(headings.length).toBeGreaterThan(0)
  })

  it('shows locations when API returns list', async () => {
    vi.mocked(locationsApi.list).mockResolvedValue({
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
    })
    await render(<Locations />)
    const freezerElements = await screen.findAllByText('Freezer A', {}, { timeout: 3000 })
    expect(freezerElements.length).toBeGreaterThan(0)
  })

  it('calls locationsApi.list on mount', async () => {
    await render(<Locations />)
    await waitFor(() => {
      expect(locationsApi.list).toHaveBeenCalled()
    })
  })

  it('shows PageError with retry when location list fails', async () => {
    vi.mocked(locationsApi.list).mockRejectedValue(new Error('fail'))
    await render(<Locations />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Could not load locations/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  it('ignores a collection search reply that arrives after a newer one', async () => {
    const plate = (id: number, title: string): SearchResult => ({
      type: 'micronix_plate', id, title, subtitle: '', url: '', data: null, name: title,
    })
    const replies: Array<(value: SearchResponse) => void> = []
    vi.mocked(searchApi.search).mockImplementation(
      () => new Promise((resolve) => { replies.push(resolve) }) as ReturnType<typeof searchApi.search>,
    )
    const user = userEvent.setup()
    await render(<Locations />)
    const box = await screen.findByPlaceholderText(/Search collections/)

    await user.type(box, 'PL-1')
    await waitFor(() => expect(replies).toHaveLength(1))
    await user.type(box, '2')
    await waitFor(() => expect(replies).toHaveLength(2))

    replies[1]({ query: 'PL-12', count: 1, results: [plate(12, 'PL-12 plate')] })
    expect(await screen.findByText('PL-12 plate')).toBeInTheDocument()
    replies[0]({ query: 'PL-1', count: 1, results: [plate(1, 'PL-1 plate')] })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('PL-1 plate')).not.toBeInTheDocument()
    expect(screen.getByText('PL-12 plate')).toBeInTheDocument()
  })
})
