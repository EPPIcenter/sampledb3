import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import LocationTreePicker from '../LocationTreePicker'

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('locations', {
  locationsApi: {
    list: vi.fn(),
  }
  })
})

import { locationsApi } from '../../lib/api/locations'

describe('LocationTreePicker', () => {
  const listMock = locationsApi.list as ReturnType<typeof vi.fn>
  beforeEach(() => {
    listMock.mockResolvedValue({ locations: [] })
  })

  it('renders and opens without crashing', async () => {
    const onChange = vi.fn()
    await render(<LocationTreePicker selected={[]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /select locations/i }))
    expect(locationsApi.list).toHaveBeenCalled()
  })

  it('with filterCollectionsOnly shows roots and collection-capable children when only children have canContainCollections', async () => {
    // Production-like: root has canContainCollections=false, only a child has true
    listMock.mockResolvedValue({
      locations: [
        {
          id: 1,
          name: 'Freezer',
          parentId: null,
          storageTypeId: '1',
          storageTypeName: '-80°C',
          effectiveStorageTypeName: '-80°C',
          path: 'Freezer',
          canContainCollections: false,
          created: '',
          lastUpdated: '',
        },
        {
          id: 2,
          name: 'Shelf 1',
          parentId: 1,
          storageTypeId: null,
          effectiveStorageTypeName: '-80°C',
          path: 'Freezer / Shelf 1',
          canContainCollections: true,
          created: '',
          lastUpdated: '',
        },
      ],
    })
    const onChange = vi.fn()
    await render(
      <LocationTreePicker selected={[]} onChange={onChange} filterCollectionsOnly={true} />
    )
    await userEvent.click(screen.getByRole('button', { name: /select locations/i }))

    await waitFor(() => {
      expect(screen.queryByText(/no locations match this filter/i)).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('Freezer')).toBeInTheDocument()
    })
    // Collection-capable child is in the tree (expand to see it)
    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await waitFor(() => {
      expect(screen.getByText('Shelf 1')).toBeInTheDocument()
    })
  })
})
