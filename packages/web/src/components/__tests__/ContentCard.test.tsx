import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import ContentCard from '../ContentCard'

// vitest.config.ts runs the suite in America/Los_Angeles (UTC-7 on this date).
describe('ContentCard timestamps', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 6:20 PM PDT on Oct 31, 2026
    vi.setSystemTime(new Date('2026-11-01T01:20:02Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a plate created just after midnight UTC on its local day, with a past age', async () => {
    await render(
      <ContentCard
        id={1}
        name="Plate 1"
        created="2026-11-01 01:10:02"
        lastUpdated="2026-11-01 01:10:02"
        collectionType="micronix_plate"
        detailUrl="/collections/1"
      />,
    )
    expect(screen.getByText('Created: Oct 31, 2026')).toBeInTheDocument()
    expect(screen.getByText('Updated: 10 minutes ago')).toBeInTheDocument()
  })
})
