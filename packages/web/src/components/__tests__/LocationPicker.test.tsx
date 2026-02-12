import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../__tests__/helpers/render'
import LocationPicker from '../LocationPicker'

vi.mock('../../lib/api', () => ({
  locationsApi: {
    list: vi.fn(),
  },
}))

import { locationsApi } from '../../lib/api'

const mockList = locationsApi.list as ReturnType<typeof vi.fn>

describe('LocationPicker', () => {
  beforeEach(() => {
    mockList.mockResolvedValue({
      data: { locations: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    })
  })

  it('renders without crashing', async () => {
    const onChange = vi.fn()
    await render(<LocationPicker value={null} onChange={onChange} />)
    expect(mockList).toHaveBeenCalled()
  })

  it('loads locations when API returns data', async () => {
    mockList.mockResolvedValue({
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
    const onChange = vi.fn()
    await render(<LocationPicker value={null} onChange={onChange} />)
    expect(mockList).toHaveBeenCalled()
  })

  it('with filterCollectionsOnly only shows Select button for locations that can contain collections', async () => {
    mockList.mockResolvedValue({
      data: {
        locations: [
          {
            id: 1,
            name: 'Root',
            parentId: null,
            storageTypeId: null,
            path: 'Root',
            canContainCollections: false,
            created: '',
            lastUpdated: '',
          },
          {
            id: 2,
            name: 'Shelf 1',
            parentId: 1,
            storageTypeId: null,
            path: 'Root / Shelf 1',
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
    const onChange = vi.fn()
    await render(
      <LocationPicker value={null} onChange={onChange} filterCollectionsOnly />
    )
    await screen.findByText('Select location...')
    const trigger = screen.getByRole('button', { name: /select location/i })
    fireEvent.click(trigger)
    await screen.findByRole('heading', { name: 'Select Location' })
    const expandRoot = await screen.findByRole('button', { name: /expand root/i })
    fireEvent.click(expandRoot)
    await screen.findByText('Shelf 1')
    const selectButtons = screen.getAllByRole('button', { name: 'Select' })
    expect(selectButtons).toHaveLength(1)
  })
})
