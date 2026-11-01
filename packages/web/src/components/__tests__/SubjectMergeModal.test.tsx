import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import SubjectMergeModal from '../SubjectMergeModal'
import type { StudySubject } from '../../lib/api/types'

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('studies', {
    studiesApi: { getSubjects: vi.fn() },
  })
})

vi.mock('../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('subjects', {
    subjectsApi: { merge: vi.fn() },
  })
})

import { studiesApi } from '../../lib/api/studies'
import { subjectsApi } from '../../lib/api/subjects'

const STUDY_ID = 7

function subject(id: number): StudySubject {
  return {
    id,
    studyId: STUDY_ID,
    name: `P${String(id).padStart(5, '0')}`,
    created: '2024-01-01 00:00:00',
    lastUpdated: '2024-01-01 00:00:00',
    specimenCount: id % 3,
  }
}

/** 1,100 subjects in the study; the mock searches and pages them as the API does. */
const allSubjects = Array.from({ length: 1_100 }, (_, i) => subject(i + 1))

function serveSubjects() {
  vi.mocked(studiesApi.getSubjects).mockImplementation(async (_id, params) => {
    const search = params?.search?.toLowerCase() ?? ''
    const matches = allSubjects.filter((s) => !search || s.name.toLowerCase().includes(search) || String(s.id) === search)
    const limit = params?.limit ?? 50
    return {
      subjects: matches.slice(0, limit),
      pagination: { page: 1, limit, total: matches.length, totalPages: Math.ceil(matches.length / limit) },
    }
  })
}

async function renderModal() {
  await render(<SubjectMergeModal isOpen onClose={vi.fn()} studyId={STUDY_ID} onSuccess={vi.fn()} />)
}

describe('SubjectMergeModal', () => {
  beforeEach(() => {
    vi.mocked(studiesApi.getSubjects).mockReset()
    vi.mocked(subjectsApi.merge).mockReset()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('searches the API, so a subject past the first 1,000 can be merged', async () => {
    serveSubjects()
    vi.mocked(subjectsApi.merge).mockResolvedValue({
      success: true,
      specimensTransferred: 1,
      specimensMerged: 0,
      containersMerged: 0,
      totalContainersTransferred: 1,
      targetSubject: subject(2),
    })
    const user = userEvent.setup()
    await renderModal()

    await user.type(screen.getByLabelText(/merge from/i), 'P01050')
    await user.click(await screen.findByRole('button', { name: /P01050/ }))

    await user.type(screen.getByLabelText(/merge into/i), 'P00002')
    await user.click(await screen.findByRole('button', { name: /P00002/ }))

    await user.click(screen.getByRole('button', { name: 'Merge Subjects' }))

    await waitFor(() => expect(subjectsApi.merge).toHaveBeenCalledWith(2, 1050))
    expect(studiesApi.getSubjects).toHaveBeenCalledWith(STUDY_ID, expect.objectContaining({ search: 'P01050' }))
  })

  it('shows the specimen count the search returns', async () => {
    serveSubjects()
    const user = userEvent.setup()
    await renderModal()

    await user.type(screen.getByLabelText(/merge from/i), 'P01052')
    const option = await screen.findByRole('button', { name: /P01052/ })

    expect(option).toHaveTextContent('2 specimens')
  })

  it('says when more subjects match than it lists', async () => {
    serveSubjects()
    const user = userEvent.setup()
    await renderModal()

    await user.click(screen.getByLabelText(/merge from/i))

    expect(await screen.findByText(/showing 50 of 1,100/i)).toBeInTheDocument()
  })

  it('shows a loading state while the search runs', async () => {
    vi.mocked(studiesApi.getSubjects).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    await renderModal()

    await user.type(screen.getByLabelText(/merge from/i), 'P0')

    expect(await screen.findByText(/searching subjects/i)).toBeInTheDocument()
  })

  it('shows the API error when the search fails', async () => {
    vi.mocked(studiesApi.getSubjects).mockRejectedValue({ response: { data: { error: 'Database is locked' } } })
    const user = userEvent.setup()
    await renderModal()

    await user.type(screen.getByLabelText(/merge from/i), 'P0')

    expect(await screen.findByText('Database is locked')).toBeInTheDocument()
  })
})
