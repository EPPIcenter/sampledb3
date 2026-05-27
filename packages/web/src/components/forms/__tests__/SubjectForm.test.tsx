import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../../__tests__/helpers/render'
import SubjectForm from '../SubjectForm'

vi.mock('../../../lib/api', async () => {
  const { createMockedApi } = await import('../../../__tests__/helpers/mock-api')
  return createMockedApi({
  studiesApi: { list: vi.fn().mockResolvedValue({ studies: [{ id: 1, title: 'Study A', shortCode: 'SA' }] }) },
  subjectsApi: {
    create: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    update: vi.fn().mockResolvedValue({ data: {} }),
  },
})
})

vi.mock('../../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../../contexts/UserContext')>('../../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('SubjectForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with studyId and onCancel', async () => {
    const onCancel = vi.fn()
    await render(
      <SubjectForm studyId={1} onCancel={onCancel} />
    )
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows name input or submit', async () => {
    const onCancel = vi.fn()
    await render(
      <SubjectForm studyId={1} onCancel={onCancel} />
    )
    const nameInput = screen.queryByLabelText(/name/i)
    const submit = screen.queryByRole('button', { name: /save|create|submit/i })
    expect(nameInput ?? submit).toBeTruthy()
  })
})
