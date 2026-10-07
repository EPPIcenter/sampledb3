import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { render, screen } from '../../__tests__/helpers/render'
import ControlBatchWizard from '../ControlBatchWizard'
import { controlsApi } from '../../lib/api/controls'

vi.mock('../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('controls', {
    controlsApi: { getDefinitionSummary: vi.fn(), suggestBatchName: vi.fn() },
  })
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

const notFound = (error: string) => Object.assign(new Error('Request failed with status code 404'), {
  response: { status: 404, data: { error } },
})

function renderWizard() {
  return render(
    <Routes>
      <Route path="/blood-controls/:definitionId/batches/new" element={<ControlBatchWizard />} />
    </Routes>,
    { initialEntries: ['/blood-controls/999/batches/new'] },
  )
}

describe('ControlBatchWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('says the control definition was not found when its summary 404s', async () => {
    vi.mocked(controlsApi.getDefinitionSummary).mockRejectedValue(notFound('Blood control with id 999 not found'))
    vi.mocked(controlsApi.suggestBatchName).mockResolvedValue({ name: 'unused' })
    await renderWizard()

    expect(await screen.findByText('Control definition not found')).toBeInTheDocument()
    expect(controlsApi.getDefinitionSummary).toHaveBeenCalledTimes(1)
  })

  it('shows the same message when the batch-name lookup 404s first', async () => {
    vi.mocked(controlsApi.getDefinitionSummary).mockReturnValue(new Promise(() => {}))
    vi.mocked(controlsApi.suggestBatchName).mockRejectedValue(notFound('Control definition not found'))
    await renderWizard()

    expect(await screen.findByText('Control definition not found')).toBeInTheDocument()
  })

  it('shows the server message for other failures', async () => {
    vi.mocked(controlsApi.getDefinitionSummary).mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: { error: 'Database is locked' } } }),
    )
    vi.mocked(controlsApi.suggestBatchName).mockResolvedValue({ name: 'unused' })
    await renderWizard()

    expect(await screen.findByText('Database is locked', {}, { timeout: 3000 })).toBeInTheDocument()
  })
})
