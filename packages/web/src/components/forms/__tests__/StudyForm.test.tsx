import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen } from '../../../__tests__/helpers/render'
import StudyForm from '../StudyForm'

const mockCreate = vi.fn().mockResolvedValue(undefined)
const mockUpdate = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../lib/api', () => ({
  studiesApi: {
    list: vi.fn().mockResolvedValue({ studies: [] }),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

describe('StudyForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders create form with required fields', async () => {
    await render(<StudyForm />)
    expect(screen.getByLabelText(/title \*/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/short code \*/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/lead person \*/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })

  it('renders cancel button', async () => {
    await render(<StudyForm />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('submits create with form data and calls studiesApi.create', async () => {
    await render(<StudyForm />)
    await userEvent.type(screen.getByLabelText(/title \*/i), 'My Study')
    await userEvent.type(screen.getByLabelText(/short code \*/i), 'MS1')
    await userEvent.type(screen.getByLabelText(/lead person \*/i), 'Jane')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Study', shortCode: 'MS1', leadPerson: 'Jane' })
    )
  })

  it('renders update form when study is provided', async () => {
    await render(
      <StudyForm
        study={{
          id: 1,
          title: 'Existing',
          shortCode: 'EX',
          description: '',
          isLongitudinal: false,
          leadPerson: 'Bob',
          created: '',
          lastUpdated: '',
        }}
      />
    )
    expect(screen.getByDisplayValue('Existing')).toBeInTheDocument()
    expect(screen.getByDisplayValue('EX')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument()
  })
})
