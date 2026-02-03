import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import LocationPicker from '../LocationPicker'

vi.mock('../../lib/api', () => ({
  locationsApi: {
    list: vi.fn(),
  },
}))

import { locationsApi } from '../../lib/api'

describe('LocationPicker', () => {
  beforeEach(() => {
    vi.mocked(locationsApi.list).mockResolvedValue({
      data: { locations: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    })
  })

  it('renders without crashing', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    expect(locationsApi.list).toHaveBeenCalled()
  })

  it('loads locations when API returns data', async () => {
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
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    expect(locationsApi.list).toHaveBeenCalled()
  })
})
