import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../../__tests__/helpers/render'
import SpecimenForm from '../SpecimenForm'
import { subjectsApi } from '../../../lib/api/subjects'
import { specimensApi } from '../../../lib/api/specimens'

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

vi.mock('../../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('specimens', specimenFormMock())
})

vi.mock('../../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reference-data', specimenFormMock())
})

vi.mock('../../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('controls', specimenFormMock())
})

vi.mock('../../../lib/api/reagents', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reagents', specimenFormMock())
})

vi.mock('../../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('collections', specimenFormMock())
})

vi.mock('../../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('settings', specimenFormMock())
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

describe('SpecimenForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with onCancel', async () => {
    const onCancel = vi.fn()
    await render(<SpecimenForm onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows source type and specimen type selection', async () => {
    await render(<SpecimenForm onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/source type \*/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/specimen type \*/i)).toBeInTheDocument()
  })

  describe('Create New Subject', () => {
    const created = {
      subject: { id: 9, studyId: 1, name: 'NEW-1', created: '2024-01-01', lastUpdated: '2024-01-01' },
      subjectCreated: true,
      specimens: [
        { id: 4, studySubjectId: 9, specimenTypeId: 1, created: '2024-01-01', lastUpdated: '2024-01-01', containerCreated: false },
      ],
      summary: { subjectsCreated: 1, subjectsUpdated: 0, specimensCreated: 1, containersCreated: 0 },
    }

    async function fillNewSubject(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('checkbox', { name: /create new subject/i }))
      await user.type(screen.getByLabelText(/subject name \*/i), 'NEW-1')
      await screen.findByRole('option', { name: 'Blood' })
      await user.selectOptions(screen.getByLabelText(/specimen type \*/i), 'Blood')
    }

    it('creates the subject and the specimen in one request', async () => {
      vi.mocked(subjectsApi.createWithSpecimens).mockResolvedValue(created)
      const onSuccess = vi.fn()
      const user = userEvent.setup()
      await render(<SpecimenForm studyId={1} studyShortCode="SA" onSuccess={onSuccess} onCancel={vi.fn()} />)

      await fillNewSubject(user)
      await user.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => expect(onSuccess).toHaveBeenCalled())
      expect(subjectsApi.createWithSpecimens).toHaveBeenCalledWith({
        studyShortCode: 'SA',
        subjectName: 'NEW-1',
        newSubjectOnly: true,
        specimens: [{ specimenTypeName: 'Blood' }],
      })
      expect(subjectsApi.create).not.toHaveBeenCalled()
      expect(specimensApi.create).not.toHaveBeenCalled()
    })

    it('says why the specimen failed and lets the retry create the subject', async () => {
      vi.mocked(subjectsApi.createWithSpecimens)
        .mockRejectedValueOnce({ response: { status: 409, data: { error: "Barcode 'X1' already exists" } } })
        .mockResolvedValueOnce(created)
      const onSuccess = vi.fn()
      const user = userEvent.setup()
      await render(<SpecimenForm studyId={1} studyShortCode="SA" onSuccess={onSuccess} onCancel={vi.fn()} />)

      await fillNewSubject(user)
      await user.click(screen.getByRole('button', { name: 'Create' }))

      expect(await screen.findByRole('alert')).toHaveTextContent("Barcode 'X1' already exists")
      expect(onSuccess).not.toHaveBeenCalled()
      expect(subjectsApi.create).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => expect(onSuccess).toHaveBeenCalled())
      expect(subjectsApi.createWithSpecimens).toHaveBeenCalledTimes(2)
    })
  })
})
