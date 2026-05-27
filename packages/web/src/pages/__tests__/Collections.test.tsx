import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import Collections from '../Collections'
import type { CollectionListItem } from '../../lib/collections-browse'

const mockCollections: CollectionListItem[] = [
  {
    id: 1,
    name: 'Plate Alpha',
    type: 'micronix_plate',
    barcode: 'PLT-001',
    locationId: 10,
    itemCount: 96,
    location: { id: 10, path: '/Freezer A/Shelf 1' },
  },
  {
    id: 2,
    name: 'Cryo Box Beta',
    type: 'cryovial_box',
    barcode: null,
    locationId: 20,
    itemCount: 81,
    location: { id: 20, path: '/Freezer B' },
  },
  {
    id: 3,
    name: 'Generic Box Gamma',
    type: 'box',
    barcode: null,
    locationId: 10,
    itemCount: 0,
    location: { id: 10, path: '/Freezer A/Shelf 1' },
  },
  {
    id: 4,
    name: 'Bag Delta',
    type: 'bag',
    barcode: null,
    locationId: 30,
    itemCount: 0,
    location: { id: 30, path: '/Room 1/Cabinet' },
  },
]

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  const { collectionsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedApi(collectionsPageMock())
})

import { collectionsApi } from '../../lib/api'

describe('Collections page', () => {
  beforeEach(() => {
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({
      data: { collections: mockCollections },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    })
  })

  it('renders title and table with expected columns and rows', async () => {
    await render(<Collections />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Collections/i })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('Plate Alpha')).toBeInTheDocument()
    })
    expect(screen.getByText('Cryo Box Beta')).toBeInTheDocument()
    expect(screen.getByText('Generic Box Gamma')).toBeInTheDocument()
    expect(screen.getByText('Bag Delta')).toBeInTheDocument()
    expect(screen.getByText('PLT-001')).toBeInTheDocument()
    expect(screen.getAllByText(/Freezer A\/Shelf 1/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('96')).toBeInTheDocument()
  })

  it('filters list when search input is changed', async () => {
    const user = userEvent.setup()
    await render(<Collections />)
    await waitFor(() => {
      expect(screen.getByText('Plate Alpha')).toBeInTheDocument()
    })
    const searchInput = screen.getByPlaceholderText(/Search by name, barcode, or location/i)
    await user.type(searchInput, 'Alpha')
    await waitFor(() => {
      expect(screen.getByText('Plate Alpha')).toBeInTheDocument()
      expect(screen.queryByText('Cryo Box Beta')).not.toBeInTheDocument()
    })
  })

  it('filters by type when a type tab is selected', async () => {
    const user = userEvent.setup()
    await render(<Collections />)
    await waitFor(() => {
      expect(screen.getByText('Plate Alpha')).toBeInTheDocument()
    })
    const cryovialTab = screen.getByRole('button', { name: /Cryovial Boxes/i })
    await user.click(cryovialTab)
    await waitFor(() => {
      expect(screen.getByText('Cryo Box Beta')).toBeInTheDocument()
      expect(screen.queryByText('Plate Alpha')).not.toBeInTheDocument()
      expect(screen.queryByText('Generic Box Gamma')).not.toBeInTheDocument()
      expect(screen.queryByText('Bag Delta')).not.toBeInTheDocument()
    })
  })

  it('renders name links with correct detail URLs', async () => {
    const user = userEvent.setup()
    await render(<Collections />)
    const allTab = await screen.findByRole('button', { name: 'All' })
    await user.click(allTab)
    const plateLink = await screen.findByRole('link', { name: 'Plate Alpha' })
    expect(plateLink).toHaveAttribute('href', '/collections/micronix-plates/1')
    const cryoLink = screen.getByRole('link', { name: 'Cryo Box Beta' })
    expect(cryoLink).toHaveAttribute('href', '/collections/cryovial-boxes/2')
  })

  it('shows All tab and other type tabs', async () => {
    await render(<Collections />)
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Micronix Plates/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cryovial Boxes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Boxes$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Bags$/i })).toBeInTheDocument()
  })

  it('uses URL as source of truth for tab so tab and page reset when opening with ?tab=', async () => {
    await render(<Collections />, { initialEntries: ['/collections?tab=micronix_plate'] })
    await waitFor(() => {
      expect(screen.getByText('Plate Alpha')).toBeInTheDocument()
    })
    expect(screen.queryByText('Cryo Box Beta')).not.toBeInTheDocument()
    expect(screen.queryByText('Generic Box Gamma')).not.toBeInTheDocument()
    expect(screen.queryByText('Bag Delta')).not.toBeInTheDocument()
    const micronixTab = screen.getByRole('button', { name: /Micronix Plates/i })
    expect(micronixTab).toHaveClass(/border-\[rgb\(var\(--app-accent\)\)\]/)
  })

  it('after sorting by Items and switching to a type tab, list shows only that type', async () => {
    const user = userEvent.setup()
    await render(<Collections />)
    await waitFor(() => {
      expect(screen.getByText('Plate Alpha')).toBeInTheDocument()
    })
    const itemsHeader = screen.getByRole('columnheader', { name: /Items/i })
    await user.click(itemsHeader)
    await waitFor(() => {
      expect(screen.getByText('Plate Alpha')).toBeInTheDocument()
    })
    const micronixTab = screen.getByRole('button', { name: /Micronix Plates/i })
    await user.click(micronixTab)
    await waitFor(() => {
      expect(screen.getByText('Plate Alpha')).toBeInTheDocument()
      expect(screen.queryByText('Cryo Box Beta')).not.toBeInTheDocument()
      expect(screen.queryByText('Generic Box Gamma')).not.toBeInTheDocument()
      expect(screen.queryByText('Bag Delta')).not.toBeInTheDocument()
    })
  })
})
