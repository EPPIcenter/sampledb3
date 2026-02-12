import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminErrorLogs from '../AdminErrorLogs'

vi.mock('../../lib/api', () => ({
  errorLogsApi: {
    list: vi.fn().mockResolvedValue({ data: { logs: [] } }),
    resolve: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('AdminErrorLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Error Logs heading', async () => {
    await render(<AdminErrorLogs />)
    const heading = await screen.findByRole('heading', { name: /error logs/i })
    expect(heading).toBeInTheDocument()
  })
})
