import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen } from '../../__tests__/helpers/render'
import MetricCard from '../dashboard/MetricCard'

describe('MetricCard', () => {
  it('renders title and value', async () => {
    await render(<MetricCard title="Studies" value={42} />)
    expect(screen.getByRole('heading', { name: 'Studies' })).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders value as string', async () => {
    await render(<MetricCard title="Status" value="Active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders link when linkTo provided', async () => {
    await render(<MetricCard title="Studies" value={10} linkTo="/studies" />)
    const link = screen.getByRole('link', { name: /10/i })
    expect(link).toHaveAttribute('href', '/studies')
  })

  it('keeps a six-digit value on one line with the full tile width, beside no icon', async () => {
    await render(<MetricCard title="Specimens" value={118069} linkTo="/specimens" />)
    const value = screen.getByText('118,069')
    // The value may not wrap or break mid-number...
    expect(value).toHaveClass('whitespace-nowrap')
    expect(value).not.toHaveClass('break-words')
    // ...and its row holds only the value and trend: the icon sits in the title row, so the
    // value is not squeezed into the space left beside a 36px icon.
    const valueRow = value.parentElement as HTMLElement
    expect(valueRow.querySelector('.w-9')).toBeNull()
    const titleRow = screen.getByRole('heading', { name: 'Specimens' }).parentElement as HTMLElement
    expect(titleRow.querySelector('.w-9')).not.toBeNull()
    // No ancestor inside the card clips the value.
    let el: HTMLElement | null = value.parentElement
    while (el && !el.classList.contains('dashboard-card')) {
      expect(el).not.toHaveClass('overflow-hidden')
      el = el.parentElement
    }
  })

  it('shows a decline with a minus sign and describes what the trend compares', async () => {
    await render(
      <MetricCard
        title="Studies"
        value={118}
        trend={{ value: 25, positive: false, label: '30d', description: 'Added in the last 30 days' }}
      />,
    )
    expect(screen.getByText('-25%')).toBeInTheDocument()
    expect(screen.getByText('Added in the last 30 days')).toHaveClass('sr-only')
  })

  it('shows a loading placeholder and no value while loading', async () => {
    await render(<MetricCard title="Subjects" status="loading" value={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading Subjects')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows an error with retry instead of a value when the count failed', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    await render(
      <MetricCard
        title="Subjects"
        status="error"
        value={0}
        errorMessage="Could not load subjects."
        onRetry={onRetry}
        linkTo="/subjects"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load subjects.')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry loading Subjects' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
