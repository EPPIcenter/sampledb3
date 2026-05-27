import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../../__tests__/helpers/render'
import SpecimenForm from '../SpecimenForm'

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
})
