import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import ContainerDetail from '../ContainerDetail'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

vi.mock('../../lib/api', () => ({
  default: { get: vi.fn() },
  derivationsApi: {
    listFromContainer: vi.fn().mockResolvedValue({ data: { derivations: [] } }),
    getSource: vi.fn().mockResolvedValue({ data: null }),
  },
}))

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

import api from '../../lib/api'

describe('ContainerDetail', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        container: { id: 1, containerType: 'micronix_tube' },
        specimen: {},
        locationPath: '/Loc/Plate',
        collection: { type: 'micronix_plate', id: 1, name: 'Plate1', position: 'A01', barcode: 'MT001' },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').AxiosResponse['config'],
    })
  })

  it('shows container content after load', async () => {
    await render(<ContainerDetail />)
    await waitFor(() => {
      const matches = screen.getAllByText(/A01|Plate1|MT001|Container/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})
