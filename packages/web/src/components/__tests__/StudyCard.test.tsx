import { describe, it, expect } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import StudyCard from '../StudyCard'
import type { Study } from '../../lib/api/studies'

const mockStudy: Study = {
  id: 1,
  title: 'Test Study',
  description: 'Description',
  shortCode: 'ST1',
  isLongitudinal: false,
  leadPerson: 'Dr. Lead',
  created: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
}

describe('StudyCard', () => {
  it('renders study title and shortCode', async () => {
    await render(<StudyCard study={mockStudy} />)
    expect(screen.getByText('Test Study')).toBeInTheDocument()
    expect(screen.getByText('ST1')).toBeInTheDocument()
  })

  it('renders link to study detail', async () => {
    await render(<StudyCard study={mockStudy} />)
    const link = screen.getByRole('link', { name: /test study/i })
    expect(link).toHaveAttribute('href', '/studies/1')
  })

  it('renders when summary with totalSubjects/totalSpecimens/totalContainers is provided', async () => {
    await render(
      <StudyCard
        study={mockStudy}
        summary={{
          studyId: 1,
          totalSubjects: 10,
          totalSpecimens: 50,
          totalContainers: 100,
          collectionDateRange: { earliest: '2024-01-01', latest: '2024-06-01' },
          studyDurationDays: 151,
          averageSpecimensPerSubject: 5,
          topSpecimenTypes: [],
        }}
      />
    )
    expect(screen.getByText('Test Study')).toBeInTheDocument()
    expect(screen.getByText('ST1')).toBeInTheDocument()
  })

  it('computes calendar-day duration when studyDurationDays is omitted, even with times of day or across DST', async () => {
    await render(
      <StudyCard
        study={mockStudy}
        summary={{
          studyId: 1,
          totalSubjects: 2,
          totalSpecimens: 2,
          totalContainers: 2,
          collectionDateRange: {
            earliest: '2024-03-01T08:00:00Z',
            latest: '2024-03-05T16:00:00Z',
          },
          averageSpecimensPerSubject: 1,
          topSpecimenTypes: [],
        }}
      />
    )
    expect(screen.getByText('Duration: 4 days')).toBeInTheDocument()
  })

  it('computes calendar-day duration across a fall-back DST boundary without rounding up', async () => {
    await render(
      <StudyCard
        study={mockStudy}
        summary={{
          studyId: 1,
          totalSubjects: 2,
          totalSpecimens: 2,
          totalContainers: 2,
          collectionDateRange: {
            earliest: '2024-11-02',
            latest: '2024-11-04',
          },
          averageSpecimensPerSubject: 1,
          topSpecimenTypes: [],
        }}
      />
    )
    expect(screen.getByText('Duration: 2 days')).toBeInTheDocument()
  })
})
