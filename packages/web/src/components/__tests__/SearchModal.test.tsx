import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import SearchModal from '../SearchModal'

vi.mock('../../lib/api/client', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('client', {
  default: {
    get: vi.fn().mockResolvedValue({ results: [], query: '', count: 0 }),
  }
  })
})

describe('SearchModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
  })

  it('renders nothing when closed', async () => {
    await render(<SearchModal isOpen={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders search input when open', async () => {
    await render(<SearchModal isOpen={true} onClose={onClose} />)
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  it('shows placeholder or empty results when open', async () => {
    await render(<SearchModal isOpen={true} onClose={onClose} />)
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })
})
