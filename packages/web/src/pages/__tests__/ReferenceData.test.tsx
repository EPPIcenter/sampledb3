import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ReferenceData from '../ReferenceData'
import { ToastContainer } from '../../components/Toast'
import { specimenTypeKeys, tagKeys } from '../../hooks/useReferenceData'
import { exportWorkflowKeys } from '../../hooks/useExportWorkflow'
import {
  createInvalidationTestClient,
  keysNotInvalidated,
  observeQuery,
  seedQueries,
} from '../../__tests__/helpers/query-invalidation'

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const crud = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() })
  return createMockedDomainModule('reference-data', {
    specimenTypesApi: {
      ...crud(),
      getContainerTypes: vi.fn(),
      addContainerType: vi.fn(),
      removeContainerType: vi.fn(),
    },
    tagsApi: crud(),
    storageTypesApi: crud(),
    strainsApi: crud(),
    unitsApi: crud(),
  })
})

import { authApi } from '../../lib/api/auth'
import { specimenTypesApi, storageTypesApi, strainsApi, tagsApi, unitsApi } from '../../lib/api/reference-data'

const plasma = { id: 3, name: 'Plasma', created: '2026-01-05T00:00:00Z', lastUpdated: '2026-01-05T00:00:00Z' }

/** Renders the page at a tab, or at the bare URL when no tab is given. */
function renderPage(tab?: string, options: Parameters<typeof render>[1] = {}) {
  return render(
    <>
      <ReferenceData />
      <ToastContainer />
    </>,
    { initialEntries: [tab ? `/reference-data?tab=${tab}` : '/reference-data'], ...options },
  )
}

describe('ReferenceData Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Signs in through the real UserProvider, so the page reads the permission flags the app computes.
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({
      user: { id: 1, name: 'Admin User', email: 'admin@example.com', role: 'admin' },
    })
    vi.mocked(specimenTypesApi.list).mockResolvedValue({ data: [plasma] })
    vi.mocked(specimenTypesApi.getContainerTypes).mockResolvedValue({ containerTypes: [], usageInfo: {} })
    vi.mocked(specimenTypesApi.create).mockResolvedValue({ ...plasma, id: 4, name: 'Serum' })
    vi.mocked(specimenTypesApi.delete).mockResolvedValue({ message: 'Specimen Type deleted successfully' })
    vi.mocked(tagsApi.list).mockResolvedValue({ data: [{ id: 1, name: 'Needs QC' }] })
    vi.mocked(storageTypesApi.list).mockResolvedValue({ data: [{ id: 1, name: 'Freezer' }] })
    vi.mocked(strainsApi.list).mockResolvedValue({ data: [{ id: 1, name: '3D7' }] })
    vi.mocked(unitsApi.list).mockResolvedValue({
      data: [{ id: 1, symbol: 'uL', name: 'microliter', category: 'volume' }],
    })
  })

  describe('Tab Switching', () => {
    it('should render with default tab (specimen-types)', async () => {
      await renderPage()

      expect(await screen.findByRole('heading', { name: 'Reference Data Management' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Specimen Types' })).toBeInTheDocument()
      expect(await screen.findByRole('cell', { name: 'Plasma' })).toBeInTheDocument()
    })

    it('should switch tabs when tab button is clicked', async () => {
      const user = userEvent.setup()
      await renderPage()
      await screen.findByRole('cell', { name: 'Plasma' })

      await user.click(screen.getByRole('button', { name: 'Tags' }))

      expect(await screen.findByRole('cell', { name: 'Needs QC' })).toBeInTheDocument()
      expect(screen.queryByRole('cell', { name: 'Plasma' })).not.toBeInTheDocument()
    })

    it('offers the five Reference data tabs, and no Locations tab', async () => {
      await renderPage()

      const tabs = within(await screen.findByRole('navigation')).getAllByRole('button')
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        'Specimen Types',
        'Tags',
        'Storage Types',
        'Strains',
        'Units',
      ])
    })

    it('rejects a Locations tab in the URL', async () => {
      await renderPage('locations')

      expect(await screen.findByText('Invalid tab')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Reference Data Management' })).not.toBeInTheDocument()
    })
  })

  describe('Data Loading', () => {
    it('renders specimen-types tab with Reference Data Management heading', async () => {
      await renderPage('specimen-types')

      expect(await screen.findByRole('heading', { name: 'Reference Data Management' })).toBeInTheDocument()
    })

    it('shows a skeleton, not the empty message, while the tab loads', async () => {
      let resolveList: (value: { data: (typeof plasma)[] }) => void = () => {}
      vi.mocked(specimenTypesApi.list).mockReturnValue(new Promise((resolve) => { resolveList = resolve }))

      const { container } = await renderPage('specimen-types')

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
      expect(screen.queryByText('No Specimen Types found')).not.toBeInTheDocument()

      resolveList({ data: [plasma] })

      expect(await screen.findByRole('cell', { name: 'Plasma' })).toBeInTheDocument()
      expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument()
    })

    it('says so when the tab has no items', async () => {
      vi.mocked(specimenTypesApi.list).mockResolvedValue({ data: [] })

      await renderPage('specimen-types')

      expect(await screen.findByText('No Specimen Types found')).toBeInTheDocument()
    })

    it('shows PageError with retry when tab load fails', async () => {
      vi.mocked(specimenTypesApi.list).mockRejectedValue(new Error('fail'))

      await renderPage('specimen-types')

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/Could not load specimen types/i)
      expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  describe('Storage types load', () => {
    const unavailable = Object.assign(new Error('Request failed'), {
      response: { data: { error: 'Storage types are unavailable' } },
    })

    it('loads storage types only for the Storage Types tab', async () => {
      vi.mocked(storageTypesApi.list).mockRejectedValue(unavailable)

      await renderPage('specimen-types')

      expect(await screen.findByRole('cell', { name: 'Plasma' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add New' })).toBeInTheDocument()
      expect(storageTypesApi.list).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows a failed storage types load on the Storage Types tab', async () => {
      vi.mocked(storageTypesApi.list).mockRejectedValue(unavailable)

      await renderPage('storage-types')

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Could not load Storage Types')
      expect(alert).toHaveTextContent('Storage types are unavailable')
      expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })

    it('lists storage types on the Storage Types tab', async () => {
      await renderPage('storage-types')

      expect(await screen.findByRole('cell', { name: 'Freezer' })).toBeInTheDocument()
      expect(storageTypesApi.list).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('Form Operations', () => {
    it('should open form when Add New button is clicked', async () => {
      const user = userEvent.setup()
      await renderPage()

      await user.click(await screen.findByRole('button', { name: 'Add New' }))

      const dialog = await screen.findByRole('dialog', { name: 'Add Specimen Types' })
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('titles the form Edit when a row is edited', async () => {
      const user = userEvent.setup()
      await renderPage()

      await user.click(await screen.findByRole('button', { name: 'Edit' }))

      const dialog = await screen.findByRole('dialog', { name: 'Edit Specimen Types' })
      expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Plasma')
    })

    it('should close form when cancel is clicked', async () => {
      const user = userEvent.setup()
      await renderPage()

      await user.click(await screen.findByRole('button', { name: 'Add New' }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(specimenTypesApi.create).not.toHaveBeenCalled()
    })
  })

  describe('Refreshing other pages', () => {
    /** Pages outside Reference Data that list Reference data: the export Tag filter and the Specimen form's specimen types. */
    const otherPages = [
      [...exportWorkflowKeys.referenceData(), 'tags'],
      specimenTypeKeys.list(),
      tagKeys.list(),
    ]

    it('invalidates the export Tag filter and Specimen form after saving a new item', async () => {
      const user = userEvent.setup()
      const queryClient = createInvalidationTestClient()
      seedQueries(queryClient, otherPages)
      await renderPage('specimen-types', { queryClient })

      await user.click(await screen.findByRole('button', { name: 'Add New' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/^Name/), 'Serum')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(specimenTypesApi.create).toHaveBeenCalledWith({ name: 'Serum' }))
      await waitFor(() => expect(keysNotInvalidated(queryClient, otherPages)).toEqual([]))
    })

    it("invalidates other pages after a delete without refetching the deleted item's queries", async () => {
      const user = userEvent.setup()
      const queryClient = createInvalidationTestClient()
      const tags = await observeQuery(queryClient, tagKeys.list())
      const deletedDetail = await observeQuery(queryClient, specimenTypeKeys.detail(3))
      await renderPage('specimen-types', { queryClient })
      // The page keeps the deleted item's container types on screen until the list reloads.
      await screen.findByRole('cell', { name: 'Plasma' })
      await waitFor(() => expect(specimenTypesApi.getContainerTypes).toHaveBeenCalledTimes(1))

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      const dialog = await screen.findByRole('dialog', { name: 'Delete item' })
      expect(dialog).toHaveTextContent('Are you sure you want to delete Plasma?')
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(specimenTypesApi.delete).toHaveBeenCalledWith(3))
      await waitFor(() => expect(tags.queryFn).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(specimenTypesApi.list).toHaveBeenCalledTimes(2))
      expect(deletedDetail.queryFn).toHaveBeenCalledTimes(1)
      expect(specimenTypesApi.getContainerTypes).toHaveBeenCalledTimes(1)
      expect(queryClient.getQueryState(specimenTypeKeys.detail(3))?.isInvalidated).toBe(true)
      for (const observed of [tags, deletedDetail]) observed.unsubscribe()
    })
  })

  describe('Deleting an item that is in use', () => {
    it("shows the API's reason in a toast and keeps the Tag", async () => {
      vi.mocked(tagsApi.delete).mockRejectedValue({
        response: { data: { error: 'Cannot delete tag: it is in use by storage containers' } },
      })
      const user = userEvent.setup()
      await renderPage('tags')

      await user.click(await screen.findByRole('button', { name: 'Delete' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Cannot delete tag: it is in use by storage containers',
      )
      expect(tagsApi.delete).toHaveBeenCalledWith(1)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'Needs QC' })).toBeInTheDocument()
    })
  })

  describe('Container type toggles', () => {
    it('refetches the saved container types when a toggle fails', async () => {
      vi.mocked(specimenTypesApi.addContainerType).mockRejectedValueOnce(new Error('Database is locked'))
      const user = userEvent.setup()
      await renderPage('specimen-types')
      await waitFor(() => expect(specimenTypesApi.getContainerTypes).toHaveBeenCalledTimes(1))

      await user.click(await screen.findByRole('button', { name: 'Micronix Tube' }))

      expect(specimenTypesApi.addContainerType).toHaveBeenCalledWith(3, 'micronix_tube')
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not add Micronix Tube: Database is locked')
      await waitFor(() => expect(specimenTypesApi.getContainerTypes).toHaveBeenCalledTimes(2))
    })
  })
})
