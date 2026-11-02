import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

describe('ActivityFeed server timestamps', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 6:20 PM PDT on Oct 31, 2026 (vitest.config.ts runs in America/Los_Angeles)
    vi.setSystemTime(new Date('2026-11-01T01:20:02Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads a timestamp just after midnight UTC as UTC: today, minutes ago', async () => {
    await render(
      <ActivityFeed
        activities={[{ id: 1, type: 'study', timestamp: '2026-11-01 01:10:02', label: 'Study A updated' }]}
      />,
    )
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('10 minutes ago')).toBeInTheDocument()
  })

  it('never shows a negative age for a timestamp ahead of the browser clock', async () => {
    await render(
      <ActivityFeed
        activities={[{ id: 1, type: 'study', timestamp: '2026-11-01 01:20:40', label: 'Study A updated' }]}
      />,
    )
    expect(screen.getByText('Just now')).toBeInTheDocument()
  })
})
