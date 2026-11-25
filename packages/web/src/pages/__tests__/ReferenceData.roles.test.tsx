import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
import ReferenceData from '../ReferenceData'

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const writes = () => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn() })
  return createMockedDomainModule('reference-data', {
    specimenTypesApi: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Plasma', created: '', lastUpdated: '' }] }),
      getContainerTypes: vi.fn().mockResolvedValue({ containerTypes: [], usageInfo: {} }),
      ...writes(),
    },
    tagsApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Needs QC' }] }), ...writes() },
    storageTypesApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Freezer' }] }), ...writes() },
    strainsApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: '3D7' }] }), ...writes() },
    unitsApi: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 1, symbol: 'uL', name: 'microliter', category: 'volume' }] }),
      ...writes(),
    },
  })
})

import { authApi } from '../../lib/api/auth'
import { tagsApi } from '../../lib/api/reference-data'

type Role = 'admin' | 'member' | 'viewer'

const VIEW_ONLY = 'Reference data is view-only. Contact an administrator to add or modify reference data.'
const ADD_TAGS_ONLY = 'You can add tags. Contact an administrator to rename or delete a tag.'

/** Signs in through the real UserProvider and opens a tab; resolves once the tab's row shows. */
async function renderTab(role: Role, tab: string, rowText: string) {
  vi.mocked(authApi.getCurrentUser).mockResolvedValue({
    user: { id: 1, name: 'Test', email: 'test@test.com', role },
  })
  const user = userEvent.setup()
  await render(<ReferenceData />, { initialEntries: [`/reference-data?tab=${tab}`] })
  await screen.findByRole('cell', { name: rowText })
  return user
}

describe('Reference Data page: what each role can do (#141)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(tagsApi.create).mockResolvedValue({ id: 2, name: 'Hold' })
  })

  describe('member', () => {
    it('sees the add control on the Tags tab, with no edit or delete', async () => {
      await renderTab('member', 'tags', 'Needs QC')

      expect(await screen.findByRole('button', { name: 'Add New' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
      expect(screen.getByText(ADD_TAGS_ONLY)).toBeInTheDocument()
    })

    it('adds a Tag', async () => {
      const user = await renderTab('member', 'tags', 'Needs QC')

      await user.click(await screen.findByRole('button', { name: 'Add New' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/^Name/), 'Hold')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(tagsApi.create).toHaveBeenCalledWith({ name: 'Hold' })
      })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('is shown why a duplicate Tag name was refused', async () => {
      vi.mocked(tagsApi.create).mockRejectedValue({
        response: { data: { error: 'Tag with this name already exists' } },
      })
      const user = await renderTab('member', 'tags', 'Needs QC')

      await user.click(await screen.findByRole('button', { name: 'Add New' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/^Name/), 'Needs QC')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      expect(await within(dialog).findByText('Tag with this name already exists')).toBeInTheDocument()
    })

    it.each([
      ['specimen-types', 'Plasma'],
      ['storage-types', 'Freezer'],
      ['strains', '3D7'],
      ['units', 'microliter'],
    ])('sees the %s tab view-only, with no add, edit, or delete', async (tab, rowText) => {
      await renderTab('member', tab, rowText)

      expect(await screen.findByText(VIEW_ONLY)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add New' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })

    it('loses the add control when leaving the Tags tab', async () => {
      const user = await renderTab('member', 'tags', 'Needs QC')
      expect(await screen.findByRole('button', { name: 'Add New' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Strains' }))

      expect(await screen.findByRole('cell', { name: '3D7' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add New' })).not.toBeInTheDocument()
    })
  })

  describe('viewer', () => {
    it('sees the Tags tab view-only, with no add, edit, or delete', async () => {
      await renderTab('viewer', 'tags', 'Needs QC')

      expect(await screen.findByText(VIEW_ONLY)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add New' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })
  })

  describe('admin', () => {
    it.each([
      ['tags', 'Needs QC'],
      ['strains', '3D7'],
    ])('sees add, edit, and delete on the %s tab', async (tab, rowText) => {
      await renderTab('admin', tab, rowText)

      expect(await screen.findByRole('button', { name: 'Add New' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect(screen.queryByText(VIEW_ONLY)).not.toBeInTheDocument()
      expect(screen.queryByText(ADD_TAGS_ONLY)).not.toBeInTheDocument()
    })
  })
})
