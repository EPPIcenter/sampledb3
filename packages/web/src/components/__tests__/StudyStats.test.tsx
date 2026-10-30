import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '../../__tests__/helpers/render'
import StudyStats from '../StudyStats'
import { DateFilterProvider, useDateFilter } from '../../contexts/DateFilterContext'
import type { StudySummary, StudyTimelineData } from '../../lib/api/studies'

type ChartProps = { title: string; data: Array<{ name: string; value: number; dateValue?: number }> }
const charts: ChartProps[] = []

vi.mock('../StatChart', () => ({
  default: (props: ChartProps) => {
    charts.push(props)
    return null
  },
}))

const summary: StudySummary['summary'] = {
  totalSubjects: 1,
  totalSpecimens: 1,
  totalContainers: 0,
  averageSpecimensPerSubject: 1,
  specimenTypes: [],
  containerTypes: {},
  collectionDateRange: { earliest: '2024-01-15', latest: '2024-01-15' },
  studyDurationDays: 0,
  collectionTimeline: [{ date: '2024-01-15', count: 1 }],
  enrollmentTimeline: [],
}

const timelineData: StudyTimelineData = {
  subjects: [
    {
      id: 1,
      name: 'S1',
      specimens: [{ id: 10, collectionDate: '2024-01-15', specimenTypeId: 1, specimenTypeName: 'DBS' }],
    },
  ],
  specimenTypes: [{ id: 1, name: 'DBS' }],
  dateRange: { earliest: '2024-01-15', latest: '2024-01-15' },
}

function WithMaxDate({ maxDate }: { maxDate: string }) {
  const { setMaxDate } = useDateFilter()
  useEffect(() => setMaxDate(maxDate), [maxDate, setMaxDate])
  return null
}

function lastChart(title: string): ChartProps | undefined {
  return [...charts].reverse().find((c) => c.title === title)
}

describe('StudyStats', () => {
  beforeEach(() => {
    charts.length = 0
  })

  // vitest.config.ts pins TZ to America/Los_Angeles, where UTC midnight is the previous day.
  it('bins a date-only collection date on its own calendar day', async () => {
    await render(
      <DateFilterProvider>
        <StudyStats summary={summary} />
      </DateFilterProvider>
    )

    const timeline = lastChart('Collection Timeline')
    expect(timeline?.data).toEqual([
      { name: 'Jan 15, 2024', value: 1, dateValue: new Date(2024, 0, 15).getTime() },
    ])
  })

  it('excludes a specimen collected the day after the max date filter', async () => {
    await render(
      <DateFilterProvider>
        <WithMaxDate maxDate="2024-01-14" />
        <StudyStats summary={summary} timelineData={timelineData} />
      </DateFilterProvider>
    )

    const totalCard = screen.getByText('Total Specimens').parentElement!
    expect(within(totalCard).getByText('0')).toBeInTheDocument()
    expect(within(totalCard).getByText(/Total: 1 \(filtered by date range\)/)).toBeInTheDocument()
  })
})
