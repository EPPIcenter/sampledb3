import { describe, it, expect } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import MetricCard from '../dashboard/MetricCard'

describe('MetricCard', () => {
  it('renders title and value', () => {
    render(<MetricCard title="Studies" value={42} />)
    expect(screen.getByText('Studies')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders value as string', () => {
    render(<MetricCard title="Status" value="Active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders link when linkTo provided', () => {
    render(<MetricCard title="Studies" value={10} linkTo="/studies" />)
    const link = screen.getByRole('link', { name: /10/i })
    expect(link).toHaveAttribute('href', '/studies')
  })
})
