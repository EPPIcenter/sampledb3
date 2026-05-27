import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../Modal'

describe('Modal', () => {
  afterEach(() => cleanup())

  it('renders nothing when closed', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Test">
        Body
      </Modal>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders title and children when open', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Delete study">
        <p>Confirm</p>
      </Modal>
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Delete study' })).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose} title="Test">
        Body
      </Modal>
    )
    const backdrops = document.body.querySelectorAll('.fixed.inset-0.bg-black\\/40')
    const backdrop = backdrops[backdrops.length - 1] as HTMLElement
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close on backdrop when closeDisabled', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose} title="Test" closeDisabled>
        Body
      </Modal>
    )
    const backdrops = document.body.querySelectorAll('.fixed.inset-0.bg-black\\/40')
    const backdrop = backdrops[backdrops.length - 1] as HTMLElement
    await user.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose} title="Test">
        Body
      </Modal>
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose} title="Test">
        Body
      </Modal>
    )
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores Escape when closeDisabled', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose} title="Test" closeDisabled>
        Body
      </Modal>
    )
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
