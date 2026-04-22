import { describe, it, expect } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import ActivityFeed from '../dashboard/ActivityFeed'

describe('ActivityFeed', () => {
  it('renders empty state when no activities', async () => {
    await render(<ActivityFeed activities={[]} />)
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument()
  })

  it('renders activity items', async () => {
    const activities = [
      {
        id: 1,
        type: 'study' as const,
        timestamp: new Date().toISOString(),
        label: 'Test Study created',
      },
    ]
    await render(<ActivityFeed activities={activities} />)
    expect(screen.getByText('Test Study created')).toBeInTheDocument()
  })

  it('shows skeleton when loading', async () => {
    await render(<ActivityFeed activities={[]} loading />)
    const skeleton = document.querySelector('[class*="animate-pulse"]')
    expect(skeleton).toBeInTheDocument()
  })

  it('never renders database IDs in activity cards', async () => {
    const activities = [
      {
        id: 42,
        type: 'specimen' as const,
        timestamp: new Date().toISOString(),
        label: '', // No label - fallback must not use #42
      },
      {
        id: 99,
        type: 'container' as const,
        timestamp: new Date().toISOString(),
        label: undefined, // No label - fallback must not use #99
      },
    ]
    const { container } = await render(<ActivityFeed activities={activities} />)
    const html = container.innerHTML
    expect(html).not.toMatch(/#\d+/)
  })
})
