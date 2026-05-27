import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import StudyPicker from '../StudyPicker'

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('studies', {
  studiesApi: {
    list: vi.fn().mockResolvedValue({
      studies: [
        { id: 1, title: 'Study A', shortCode: 'SA', description: null, isLongitudinal: false, leadPerson: 'Lead', created: '', lastUpdated: '', createdBy: null, updatedBy: null },
        { id: 2, title: 'Study B', shortCode: 'SB', description: null, isLongitudinal: false, leadPerson: 'Lead', created: '', lastUpdated: '', createdBy: null, updatedBy: null },
      ],
    }),
  }
  })
})

describe('StudyPicker', () => {
  it('renders trigger with placeholder when no value', async () => {
    const onChange = vi.fn()
    await render(<StudyPicker onChange={onChange} />)
    expect(screen.getByText('Select a study…')).toBeInTheDocument()
  })

  it('opens dropdown when trigger clicked', async () => {
    const onChange = vi.fn()
    await render(<StudyPicker onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /select a study/i }))
    expect(screen.getByText('Study A')).toBeInTheDocument()
    expect(screen.getByText('Study B')).toBeInTheDocument()
  })

  it('calls onChange when study selected', async () => {
    const onChange = vi.fn()
    await render(<StudyPicker onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /select a study/i }))
    await userEvent.click(screen.getByText('Study A'))
    expect(onChange).toHaveBeenCalledWith(1)
  })
})
