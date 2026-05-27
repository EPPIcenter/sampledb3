import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../../__tests__/helpers/render'
import SubjectForm from '../SubjectForm'

vi.mock('../../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('studies', specimenFormMock())
})

vi.mock('../../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('subjects', specimenFormMock())
})

vi.mock('../../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../../contexts/UserContext')>('../../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('SubjectForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with onCancel', async () => {
    const onCancel = vi.fn()
    await render(<SubjectForm onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows subject name field', async () => {
    await render(<SubjectForm onCancel={vi.fn()} studyId={1} />)
    expect(screen.getByLabelText(/subject name \*/i)).toBeInTheDocument()
  })
})
