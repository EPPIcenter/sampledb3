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
})
