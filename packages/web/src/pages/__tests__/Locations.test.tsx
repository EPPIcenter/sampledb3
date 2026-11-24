import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
import Locations from '../Locations'

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { locationsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { locationsApi } = locationsPageMock()
  return createMockedDomainModule('locations', {
    locationsApi: {
      ...(locationsApi as Record<string, unknown>),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  })
})

vi.mock('../../lib/api/search', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { locationsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { searchApi } = locationsPageMock()
  return createMockedDomainModule('search', { searchApi })
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', {
    storageTypesApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 7, name: 'Freezer' }] }) },
  })
})

import { authApi } from '../../lib/api/auth'
import { locationsApi } from '../../lib/api/locations'
import { searchApi, type SearchResponse, type SearchResult } from '../../lib/api/search'

type Role = 'admin' | 'member' | 'viewer'

/** Signs in through the real UserProvider, so the page reads the permission flags the app computes. */
function signInAs(role: Role) {
  vi.mocked(authApi.getCurrentUser).mockResolvedValue({
    user: { id: 1, name: 'Test', email: 'test@test.com', role },
  })
}

describe('Locations page', () => {
  beforeEach(() => {
    signInAs('member')
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

describe('Locations page: what each role can do (#141)', () => {
  const freezer = {
    id: 1, name: 'Freezer A', parentId: null, storageTypeId: '7', path: 'Freezer A',
    canContainCollections: true, created: '', lastUpdated: '',
  }
  const shelf = {
    id: 2, name: 'Shelf 1', parentId: 1, storageTypeId: null, path: 'Freezer A → Shelf 1',
    canContainCollections: true, created: '', lastUpdated: '',
  }
  const emptyContents = { micronixPlates: [], cryovialBoxes: [], boxes: [], bags: [] }

  /** `locationsApi.get` replies for a Location that holds the given contents. */
  function mockDetail(location: typeof freezer | typeof shelf, contents: Record<string, unknown[]> = {}) {
    vi.mocked(locationsApi.get).mockResolvedValue({
      location,
      contents: { ...emptyContents, ...contents },
    } as unknown as Awaited<ReturnType<typeof locationsApi.get>>)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(locationsApi.list).mockResolvedValue({ locations: [freezer, shelf] })
    mockDetail(freezer)
    vi.mocked(locationsApi.create).mockResolvedValue({ location: { ...shelf, id: 3 } })
    vi.mocked(locationsApi.delete).mockResolvedValue({ message: 'Location deleted successfully' })
  })

  async function renderAs(role: Role) {
    signInAs(role)
    const user = userEvent.setup()
    await render(<Locations />)
    // The tree opens with its roots collapsed; expand Freezer A so both rows show.
    await user.click(await screen.findByRole('button', { name: 'Expand Freezer A' }))
    await screen.findByRole('button', { name: /^Shelf 1/ })
    return user
  }

  describe('tree rows', () => {
    it('expands and collapses a Location with a toggle named for it', async () => {
      signInAs('viewer')
      const user = userEvent.setup()
      await render(<Locations />)

      const expand = await screen.findByRole('button', { name: 'Expand Freezer A' })
      expect(expand).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('button', { name: /^Shelf 1/ })).not.toBeInTheDocument()

      await user.click(expand)

      expect(await screen.findByRole('button', { name: /^Shelf 1/ })).toBeInTheDocument()
      const collapse = screen.getByRole('button', { name: 'Collapse Freezer A' })
      expect(collapse).toHaveAttribute('aria-expanded', 'true')

      await user.click(collapse)

      expect(screen.queryByRole('button', { name: /^Shelf 1/ })).not.toBeInTheDocument()
    })

    it('gives a Location with no child Locations no toggle', async () => {
      await renderAs('viewer')

      expect(screen.queryByRole('button', { name: /(Expand|Collapse) Shelf 1/ })).not.toBeInTheDocument()
    })

    it('keeps the toggle outside the button that selects the Location', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      await renderAs('viewer')

      const row = screen.getByRole('button', { name: /^Freezer A/ })
      expect(row).not.toContainElement(screen.getByRole('button', { name: 'Collapse Freezer A' }))
      for (const button of screen.getAllByRole('button')) {
        expect(button.querySelector('button')).toBeNull()
      }
      // React logs "<button> cannot be a descendant of <button>" for a nested one.
      expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/descendant|validateDOMNesting/)
      consoleError.mockRestore()
    })
  })

  /** Opens the page the way the Create Location command does. */
  async function renderFromCreateCommand(role: Role) {
    signInAs(role)
    await render(<Locations />, { initialEntries: ['/locations?createLocation=true'] })
  }

  describe('member', () => {
    it('sees the create and delete controls, and no edit control', async () => {
      await renderAs('member')

      expect(await screen.findByRole('button', { name: 'Add Root' })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Add child location' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Delete location' })).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'Edit location' })).not.toBeInTheDocument()
    })

    it('creates a Location under an existing one that can hold Collections', async () => {
      const user = await renderAs('member')

      await user.click((await screen.findAllByRole('button', { name: 'Add child location' }))[0])
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Add Child Location' })).toBeInTheDocument()
      await user.type(within(dialog).getByLabelText(/^Name/), 'Shelf 2')
      await user.click(within(dialog).getByRole('checkbox', { name: 'Can Contain Collections' }))
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(locationsApi.create).toHaveBeenCalledWith({
          name: 'Shelf 2',
          description: null,
          canContainCollections: true,
          parentId: 1,
          storageTypeId: null,
        })
      })
      expect(await screen.findByText('Location created successfully')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('creates a root Location with its storage type', async () => {
      const user = await renderAs('member')

      await user.click(await screen.findByRole('button', { name: 'Add Root' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/^Name/), 'Room 325')
      await user.selectOptions(await within(dialog).findByLabelText(/^Storage Type/), 'Freezer')
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(locationsApi.create).toHaveBeenCalledWith({
          name: 'Room 325',
          description: null,
          canContainCollections: false,
          parentId: null,
          storageTypeId: '7',
        })
      })
    })

    it('shows the API error in the form when a create is refused', async () => {
      vi.mocked(locationsApi.create).mockRejectedValue({
        response: { data: { error: 'Location with this name already exists under the same parent' } },
      })
      const user = await renderAs('member')

      await user.click((await screen.findAllByRole('button', { name: 'Add child location' }))[0])
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/^Name/), 'Shelf 1')
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      expect(
        await within(dialog).findByText('Location with this name already exists under the same parent'),
      ).toBeInTheDocument()
    })

    it('is offered "Create first location" when there are no Locations', async () => {
      vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] })
      signInAs('member')
      const user = userEvent.setup()
      await render(<Locations />)

      await user.click(await screen.findByRole('button', { name: 'Create first location' }))

      expect(await screen.findByRole('heading', { name: 'Add Root Location' })).toBeInTheDocument()
    })

    it('opens the create form from the Create Location command', async () => {
      await renderFromCreateCommand('member')

      expect(await screen.findByRole('heading', { name: 'Add Root Location' })).toBeInTheDocument()
    })

    it('deletes an empty Location', async () => {
      mockDetail(shelf)
      const user = await renderAs('member')

      await user.click((await screen.findAllByRole('button', { name: 'Delete location' }))[1])
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Shelf 1')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(locationsApi.delete).toHaveBeenCalledWith(2))
      expect(await screen.findByText('Location deleted successfully')).toBeInTheDocument()
    })

    it('is told a Location with child Locations cannot be deleted', async () => {
      const user = await renderAs('member')

      await user.click((await screen.findAllByRole('button', { name: 'Delete location' }))[0])
      const dialog = await screen.findByRole('dialog')

      expect(within(dialog).getByText('Warning: This location has 1 child location(s).')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled()
      expect(locationsApi.delete).not.toHaveBeenCalled()
    })

    it('is told a Location that holds Collections cannot be deleted', async () => {
      mockDetail(shelf, { bags: [{ id: 5, name: 'IMMERSE 2025 samples', locationId: 2 }] })
      const user = await renderAs('member')

      await user.click((await screen.findAllByRole('button', { name: 'Delete location' }))[1])
      const dialog = await screen.findByRole('dialog')

      expect(within(dialog).getByText('Warning: This location holds collections.')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled()
      expect(locationsApi.delete).not.toHaveBeenCalled()
    })
  })

  describe('viewer', () => {
    it('sees no create, edit, or delete control', async () => {
      await renderAs('viewer')

      expect(screen.queryByRole('button', { name: 'Add Root' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add child location' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit location' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete location' })).not.toBeInTheDocument()
    })

    it('is not offered "Create first location" when there are no Locations', async () => {
      vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] })
      signInAs('viewer')
      await render(<Locations />)

      expect(await screen.findByText('No locations have been configured yet.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Create first location' })).not.toBeInTheDocument()
    })

    it('does not get the create form from a Create Location link', async () => {
      await renderFromCreateCommand('viewer')

      // The form opens once the list has loaded, so wait for the tree before checking.
      expect(await screen.findByRole('button', { name: /^Freezer A/ })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('admin', () => {
    it('sees the create, edit, and delete controls', async () => {
      await renderAs('admin')

      expect(await screen.findByRole('button', { name: 'Add Root' })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Add child location' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Edit location' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Delete location' })).toHaveLength(2)
    })
  })
})
