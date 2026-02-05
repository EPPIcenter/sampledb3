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
})
