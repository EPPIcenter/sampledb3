import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import Derivations from '../Derivations'

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('Derivations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Derivations heading', async () => {
    await render(<Derivations />)
    const heading = screen.getByRole('heading', { name: /derivations/i })
    expect(heading).toBeInTheDocument()
  })

  it('shows derivation list view or container detail hint', async () => {
    await render(<Derivations />)
    const hints = screen.getAllByText(/browse derivations|container detail|Create one derivation/i)
    expect(hints.length).toBeGreaterThan(0)
  })
})
