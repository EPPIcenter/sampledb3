import { describe, it, expect } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import SimpleTimeline from '../SimpleTimeline'

describe('SimpleTimeline', () => {
  // vitest.config.ts pins TZ to America/Los_Angeles, where UTC midnight is the previous day.
  it('heads a group with its own calendar day for a date-only collection date', async () => {
    await render(
      <SimpleTimeline
        specimens={[
          {
            id: 1,
            specimenTypeId: 1,
            specimenTypeName: 'DBS',
            collectionDate: '2024-01-15',
            created: '2024-02-01T12:00:00Z',
            lastUpdated: '2024-02-01T12:00:00Z',
            containerCount: 0,
            containerBreakdown: {},
          },
        ]}
      />,
    )

    expect(screen.getByText('Collected: Jan 15, 2024')).toBeInTheDocument()
  })
})
