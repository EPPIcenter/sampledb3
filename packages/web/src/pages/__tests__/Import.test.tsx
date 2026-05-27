import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import Import from '../Import'

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
  studiesApi: { list: vi.fn().mockResolvedValue({ data: { studies: [], pagination: { total: 0 } } }) },
  specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  subjectsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  collectionsApi: { createMicronixPlate: vi.fn(), createCryovialBox: vi.fn() },
})
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

describe('Import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders BulkImportFlow when canWrite', async () => {
    await render(<Import />)
    await waitFor(() => {
      const matches = screen.getAllByText(/import|upload|subjects|specimens|CSV/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})
