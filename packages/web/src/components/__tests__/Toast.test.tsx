import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import { ToastContainer } from '../Toast'
import type { Toast as ToastType } from '../../contexts/ToastContext'

const mockRemoveToast = vi.fn()
let mockToasts: ToastType[] = []

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    toasts: mockToasts,
    removeToast: mockRemoveToast,
    addToast: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('Toast', () => {
  beforeEach(() => {
    mockRemoveToast.mockClear()
  })

  it('renders nothing when toasts array is empty', async () => {
    mockToasts = []
    const { container } = await render(<ToastContainer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders toast message when toasts exist', async () => {
    mockToasts = [{ id: 'toast-1', message: 'Test toast message', type: 'success' }]
    await render(<ToastContainer />)
    expect(screen.getByText('Test toast message')).toBeInTheDocument()
  })

  it('calls removeToast when close button is clicked', async () => {
    mockToasts = [{ id: 'toast-1', message: 'Close me', type: 'info' }]
    await render(<ToastContainer />)
    expect(screen.getByText('Close me')).toBeInTheDocument()
    const closeButton = screen.getByRole('button', { name: /close/i })
    const user = userEvent.setup()
    await user.click(closeButton)
    expect(mockRemoveToast).toHaveBeenCalledWith('toast-1')
  })
})
