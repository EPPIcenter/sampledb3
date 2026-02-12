import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import SpecimenDetail from '../SpecimenDetail'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

vi.mock('../../lib/api', () => ({
  default: { get: vi.fn() },
  specimensApi: {
    get: vi.fn().mockResolvedValue({
      specimen: {
        id: 1,
        specimenTypeId: 1,
        specimenType: { name: 'Blood' },
        studySubjectId: 1,
        collectionDate: null,
      },
    }),
  },
}))

import api from '../../lib/api'

describe('SpecimenDetail', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: { subject: { id: 1, name: 'S1', studyId: 1 }, study: { title: 'Study', code: 'ST1' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').AxiosResponse['config'],
    })
  })

  it('shows specimen content after load', async () => {
    await render(<SpecimenDetail />)
    await waitFor(() => {
      const matches = screen.getAllByText(/Containers|No containers found/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})
