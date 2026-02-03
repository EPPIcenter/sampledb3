import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import Pagination from '../Pagination'

describe('Pagination', () => {
  it('returns null when totalPages <= 1', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Previous and Next buttons and page info', () => {
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        totalItems={50}
        itemsPerPage={10}
        onPageChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
    expect(screen.getByText('Previous')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('disables Previous on first page', () => {
    render(
      <Pagination currentPage={1} totalPages={3} onPageChange={vi.fn()} />
    )
    const prev = screen.getByRole('button', { name: /previous/i })
    expect(prev).toBeDisabled()
  })

  it('disables Next on last page', () => {
    render(
      <Pagination currentPage={3} totalPages={3} onPageChange={vi.fn()} />
    )
    const next = screen.getByRole('button', { name: /next/i })
    expect(next).toBeDisabled()
  })

  it('calls onPageChange with previous page when Previous clicked', async () => {
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={2} totalPages={3} onPageChange={onPageChange} />
    )
    const prev = screen.getByRole('button', { name: /previous/i })
    await userEvent.click(prev)
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('calls onPageChange with next page when Next clicked', async () => {
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={2} totalPages={3} onPageChange={onPageChange} />
    )
    const next = screen.getByRole('button', { name: /next/i })
    await userEvent.click(next)
    expect(onPageChange).toHaveBeenCalledWith(3)
  })
})
