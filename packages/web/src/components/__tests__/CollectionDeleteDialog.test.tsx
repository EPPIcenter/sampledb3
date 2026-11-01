import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { render } from '../../__tests__/helpers/render'
import CollectionDeleteDialog from '../CollectionDeleteDialog'
import { collectionsApi } from '../../lib/api/collections'
import { collectionKeys, useAllCollections, useMicronixPlate } from '../../hooks/useCollections'
import { dashboardKeys } from '../../hooks/useDashboard'
import { studyKeys } from '../../hooks/useStudies'
import { subjectKeys } from '../../hooks/useSubjects'
import { locationKeys } from '../../hooks/useLocations'

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
    collectionsApi: {
      deletePreflight: vi.fn(),
      deleteWithContents: vi.fn(),
      listAllCollections: vi.fn(),
      getMicronixPlate: vi.fn(),
    },
  })
})

type Preflight = Awaited<ReturnType<typeof collectionsApi.deletePreflight>>

function preflight(overrides: Partial<Preflight> = {}): Preflight {
  return {
    canDelete: true,
    blockers: [],
    summary: { containerCount: 96, specimenCount: 90, emptySubjectCount: 12 },
    ...overrides,
  }
}

const deleted = {
  containersDeleted: 96,
  specimensDeleted: 90,
  sheetsDeleted: 0,
  collectionDeleted: true as const,
  subjectsDeleted: 0,
}

function renderDialog(onDeleted = vi.fn()) {
  return render(
    <CollectionDeleteDialog
      isOpen
      onClose={vi.fn()}
      collectionType="micronix_plate"
      id={4}
      collectionName="103"
      kindLabel="Micronix plate"
      onDeleted={onDeleted}
    />
  )
}

function removedItems() {
  const section = screen.getByRole('region', { name: 'What will be removed' })
  return within(section)
    .getAllByRole('listitem')
    .map((li) => li.textContent)
}

describe('CollectionDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading message while it counts what the delete removes', async () => {
    vi.mocked(collectionsApi.deletePreflight).mockReturnValue(new Promise(() => {}))
    await renderDialog()

    expect(screen.getByRole('status')).toHaveTextContent('Counting what this delete removes')
    expect(screen.getByRole('button', { name: 'Delete collection' })).toBeDisabled()
  })

  it('shows the preflight error and keeps delete disabled', async () => {
    vi.mocked(collectionsApi.deletePreflight).mockRejectedValue(new Error('Network Error'))
    const user = userEvent.setup()
    await renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not count what this delete removes: Network Error')
    await user.type(screen.getByPlaceholderText('103'), '103')
    expect(screen.getByRole('button', { name: 'Delete collection' })).toBeDisabled()
  })

  it('shows the Containers, Specimens and Subjects the delete removes before the user confirms', async () => {
    vi.mocked(collectionsApi.deletePreflight).mockResolvedValue(preflight())
    await renderDialog()

    await screen.findByText('This removes:')
    expect(collectionsApi.deletePreflight).toHaveBeenCalledWith({ collectionType: 'micronix_plate', id: 4 })
    expect(removedItems()).toEqual([
      '96 Containers',
      '90 Specimens',
      '0 Subjects (12 Subjects left with no Specimens)',
    ])
    expect(collectionsApi.deleteWithContents).not.toHaveBeenCalled()
  })

  it('counts the empty Subjects as removed when the user opts to remove them', async () => {
    vi.mocked(collectionsApi.deletePreflight).mockResolvedValue(
      preflight({ summary: { containerCount: 1, specimenCount: 1, emptySubjectCount: 1 } })
    )
    const user = userEvent.setup()
    await renderDialog()

    await screen.findByText('This removes:')
    expect(removedItems()).toEqual(['1 Container', '1 Specimen', '0 Subjects (1 Subject left with no Specimens)'])

    await user.click(screen.getByRole('checkbox', { name: /Also remove study participants/ }))
    expect(removedItems()).toEqual(['1 Container', '1 Specimen', '1 Subject'])
  })

  it('lists preflight blockers and keeps delete disabled', async () => {
    vi.mocked(collectionsApi.deletePreflight).mockResolvedValue(
      preflight({
        canDelete: false,
        blockers: [{ code: 'qpcr_wells_link_storage_containers', message: 'Still assigned in qPCR.' }],
      })
    )
    const user = userEvent.setup()
    await renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('Still assigned in qPCR.')
    await user.type(screen.getByPlaceholderText('103'), '103')
    expect(screen.getByRole('button', { name: 'Delete collection' })).toBeDisabled()
  })

  it('deletes with the chosen Subject option once the name matches', async () => {
    vi.mocked(collectionsApi.deletePreflight).mockResolvedValue(preflight())
    vi.mocked(collectionsApi.deleteWithContents).mockResolvedValue({ ...deleted, subjectsDeleted: 12 })
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    await renderDialog(onDeleted)

    await screen.findByText('This removes:')
    const deleteButton = screen.getByRole('button', { name: 'Delete collection' })
    expect(deleteButton).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Also remove study participants/ }))
    await user.type(screen.getByPlaceholderText('103'), '103')
    await user.click(deleteButton)

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(collectionsApi.deleteWithContents).toHaveBeenCalledWith({
      collectionType: 'micronix_plate',
      id: 4,
      removeEmptySubjects: true,
    })
  })

  it('shows the blockers a 409 returns', async () => {
    vi.mocked(collectionsApi.deletePreflight).mockResolvedValue(preflight())
    vi.mocked(collectionsApi.deleteWithContents).mockRejectedValue(
      new AxiosError('Conflict', '409', undefined, undefined, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { error: 'Cannot delete.', blockers: [{ code: 'x', message: 'Derived child elsewhere.' }] },
      })
    )
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    await renderDialog(onDeleted)

    await screen.findByText('This removes:')
    await user.type(screen.getByPlaceholderText('103'), '103')
    await user.click(screen.getByRole('button', { name: 'Delete collection' }))

    expect(await screen.findByText('Cannot delete.')).toBeInTheDocument()
    expect(screen.getByText('Derived child elsewhere.')).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
  })
})

function PlatePage() {
  const navigate = useNavigate()
  const plate = useMicronixPlate(4)
  return (
    <>
      <h1>{plate.data ? `Plate ${plate.data.plate.name}` : 'Loading plate'}</h1>
      <CollectionDeleteDialog
        isOpen
        onClose={() => {}}
        collectionType="micronix_plate"
        id={4}
        collectionName="103"
        kindLabel="Micronix plate"
        onDeleted={() => navigate('/collections')}
      />
    </>
  )
}

function CollectionsPage() {
  const list = useAllCollections()
  return (
    <ul aria-label="Collections">
      {(list.data ?? []).map((c) => (
        <li key={c.id}>{c.name}</li>
      ))}
    </ul>
  )
}

describe('CollectionDeleteDialog refresh after delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshes the Collections list and marks every other cached query stale, without refetching the deleted plate', async () => {
    vi.mocked(collectionsApi.deletePreflight).mockResolvedValue(preflight())
    vi.mocked(collectionsApi.deleteWithContents).mockResolvedValue(deleted)
    vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
      plate: { id: 4, name: '103' },
      wells: {},
    } as Awaited<ReturnType<typeof collectionsApi.getMicronixPlate>>)
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({
      collections: [{ id: 7, name: 'Other plate' }],
    } as Awaited<ReturnType<typeof collectionsApi.listAllCollections>>)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 }, mutations: { retry: false } },
    })
    // Fresh cache from earlier pages: the list still has the plate, and dashboard, study,
    // Subject and Location data predate the delete.
    queryClient.setQueryData(collectionKeys.listAll(), [
      { id: 4, name: '103' },
      { id: 7, name: 'Other plate' },
    ])
    const otherKeys = [dashboardKeys.count('specimens'), studyKeys.summaryCard(1), subjectKeys.summary(2), locationKeys.detail(3)]
    for (const key of otherKeys) queryClient.setQueryData(key, { stale: false })

    const user = userEvent.setup()
    await render(
      <Routes>
        <Route path="/plates/4" element={<PlatePage />} />
        <Route path="/collections" element={<CollectionsPage />} />
      </Routes>,
      { queryClient, initialEntries: ['/plates/4'] }
    )

    expect(await screen.findByRole('heading', { name: 'Plate 103' })).toBeInTheDocument()
    await screen.findByText('This removes:')
    await user.type(screen.getByPlaceholderText('103'), '103')
    await user.click(screen.getByRole('button', { name: 'Delete collection' }))

    const list = await screen.findByRole('list', { name: 'Collections' })
    await waitFor(() => expect(within(list).queryByText('103')).not.toBeInTheDocument())
    expect(within(list).getByText('Other plate')).toBeInTheDocument()
    expect(collectionsApi.listAllCollections).toHaveBeenCalledTimes(1)

    for (const key of otherKeys) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true)
    }
    expect(queryClient.getQueryState(collectionKeys.micronixPlate(4))?.isInvalidated).toBe(true)
    expect(collectionsApi.getMicronixPlate).toHaveBeenCalledTimes(1)
  })
})
