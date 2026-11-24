import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ReferenceDataTable from '../ReferenceDataTable'
import { ToastContainer } from '../Toast'
import { authApi } from '../../lib/api/auth'

interface TestItem {
  id: number
  name: string
  value: number
}

describe('ReferenceDataTable', () => {
  const columns = [
    { key: 'name' as const, label: 'Name' },
    { key: 'value' as const, label: 'Value' },
  ]

  const testData: TestItem[] = [
    { id: 1, name: 'Item 1', value: 10 },
    { id: 2, name: 'Item 2', value: 20 },
    { id: 3, name: 'Item 3', value: 30 },
  ]

  /** Signs in through the real UserProvider, so the table reads the permission flags the app computes. */
  function signInAs(role: 'admin' | 'member' | 'viewer') {
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({
      user: { id: 1, name: 'Test', email: 'test@test.com', role },
    })
  }

  function renderTable(props: Partial<React.ComponentProps<typeof ReferenceDataTable<TestItem>>> = {}) {
    const onEdit = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    return {
      onEdit,
      onDelete,
      rendered: render(
        <>
          <ReferenceDataTable data={testData} columns={columns} onEdit={onEdit} onDelete={onDelete} {...props} />
          <ToastContainer />
        </>,
      ),
    }
  }

  /** The row for an item, found by its name cell. */
  async function rowOf(name: string) {
    return (await screen.findByRole('cell', { name })).closest('tr')!
  }

  beforeEach(() => {
    vi.clearAllMocks()
    signInAs('admin')
  })

  it('should render table with data', async () => {
    await renderTable().rendered

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Item 1' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Item 2' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Item 3' })).toBeInTheDocument()
  })

  it('should call onEdit when edit button is clicked', async () => {
    const user = userEvent.setup()
    const { onEdit, rendered } = renderTable()
    await rendered

    await user.click(within(await rowOf('Item 1')).getByRole('button', { name: 'Edit' }))

    expect(onEdit).toHaveBeenCalledWith(testData[0])
  })

  it('shows no edit or delete control when read-only', async () => {
    await renderTable({ readOnly: true }).rendered

    expect(await screen.findByRole('cell', { name: 'Item 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  describe('delete', () => {
    it('should call onDelete when delete button is clicked and confirmed', async () => {
      const user = userEvent.setup()
      const confirm = vi.spyOn(window, 'confirm')
      const { onDelete, rendered } = renderTable()
      await rendered

      await user.click(within(await rowOf('Item 1')).getByRole('button', { name: 'Delete' }))

      const dialog = await screen.findByRole('dialog', { name: 'Delete item' })
      expect(dialog).toHaveTextContent('Are you sure you want to delete Item 1?')
      expect(onDelete).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1))
      expect(onDelete).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(confirm).not.toHaveBeenCalled()
    })

    it('deletes nothing when the confirmation is cancelled', async () => {
      const user = userEvent.setup()
      const { onDelete, rendered } = renderTable()
      await rendered

      await user.click(within(await rowOf('Item 2')).getByRole('button', { name: 'Delete' }))
      const dialog = await screen.findByRole('dialog', { name: 'Delete item' })
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(onDelete).not.toHaveBeenCalled()
    })

    it("shows the API's reason in a toast when the delete is refused", async () => {
      const user = userEvent.setup()
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const { rendered } = renderTable({
        onDelete: vi.fn().mockRejectedValue({
          response: { data: { error: 'Cannot delete tag: it is in use by storage containers' } },
        }),
      })
      await rendered

      await user.click(within(await rowOf('Item 1')).getByRole('button', { name: 'Delete' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Cannot delete tag: it is in use by storage containers',
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'Item 1' })).toBeInTheDocument()
      expect(alert).not.toHaveBeenCalled()
    })

    it('says the delete failed when the error carries no message', async () => {
      const user = userEvent.setup()
      const { rendered } = renderTable({ onDelete: vi.fn().mockRejectedValue({}) })
      await rendered

      await user.click(within(await rowOf('Item 1')).getByRole('button', { name: 'Delete' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete item')
    })

    it('disables the dialog while the delete runs', async () => {
      const user = userEvent.setup()
      let finish: () => void = () => {}
      const { rendered } = renderTable({
        onDelete: vi.fn(() => new Promise<void>((resolve) => { finish = resolve })),
      })
      await rendered

      await user.click(within(await rowOf('Item 1')).getByRole('button', { name: 'Delete' }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      expect(await within(dialog).findByRole('button', { name: 'Deleting...' })).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()

      finish()

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('asks about "this item" when the item has no name', async () => {
      const user = userEvent.setup()
      await render(
        <ReferenceDataTable
          data={[{ id: 7, symbol: 'uL' }]}
          columns={[{ key: 'symbol' as const, label: 'Symbol' }]}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      )

      await user.click(await screen.findByRole('button', { name: 'Delete' }))

      expect(await screen.findByRole('dialog')).toHaveTextContent('Are you sure you want to delete this item?')
    })
  })

  it('should filter data when search is provided', async () => {
    const user = userEvent.setup()
    await renderTable({ searchPlaceholder: 'Search items...' }).rendered

    await user.type(screen.getByPlaceholderText('Search items...'), 'Item 1')

    expect(screen.getByRole('cell', { name: 'Item 1' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'Item 2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'Item 3' })).not.toBeInTheDocument()
  })

  it('should show empty message when no data', async () => {
    await renderTable({ data: [], emptyMessage: 'No items found' }).rendered

    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('should show loading state', async () => {
    const { container } = await renderTable({ data: [], loading: true, emptyMessage: 'No items found' }).rendered

    // SkeletonTable has no role or label to query by.
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(screen.queryByText('No items found')).not.toBeInTheDocument()
  })

  it('should use custom render function for columns', async () => {
    await renderTable({
      columns: [
        { key: 'name' as const, label: 'Name' },
        { key: 'value' as const, label: 'Value', render: (value: number) => `$${value}` },
      ],
    }).rendered

    expect(screen.getByRole('cell', { name: '$10' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '$20' })).toBeInTheDocument()
  })
})
