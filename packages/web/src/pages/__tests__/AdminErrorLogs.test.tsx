import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosResponse } from 'axios'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import AdminErrorLogs from '../AdminErrorLogs'
import { formatErrorLogForLLM } from '../../lib/error-log-prompt'
import { errorLogsApi, type ErrorLog, type ErrorLogsResponse } from '../../lib/api/error-logs'

vi.mock('../../lib/api/error-logs', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('error-logs', {
  errorLogsApi: {
    list: vi.fn().mockResolvedValue({ data: { logs: [] } }),
    get: vi.fn(),
    resolve: vi.fn().mockResolvedValue(undefined),
  }
  })
})

const mockErrorLog: ErrorLog = {
  id: 42,
  timestamp: '2025-03-05T12:00:00Z',
  source: 'frontend',
  level: 'error',
  message: 'Test error message for copy',
  stack: 'Error at foo (bar.ts:10)',
  resolved: false,
}

const emptyListResponse: AxiosResponse<ErrorLogsResponse> = {
  data: {
    logs: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  },
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as AxiosResponse<ErrorLogsResponse>['config'],
}

describe('AdminErrorLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(errorLogsApi.list).mockResolvedValue(emptyListResponse)
  })

  it('shows Error Logs heading', async () => {
    await render(<AdminErrorLogs />)
    const heading = await screen.findByRole('heading', { name: /error logs/i })
    expect(heading).toBeInTheDocument()
  })

  it('Copy for LLM button copies formatted prompt to clipboard', async () => {
    vi.mocked(errorLogsApi.list).mockResolvedValue({
      ...emptyListResponse,
      data: {
        logs: [mockErrorLog],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      },
    })
    const getResponse: AxiosResponse<ErrorLog> = {
      data: mockErrorLog,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as AxiosResponse<ErrorLog>['config'],
    }
    vi.mocked(errorLogsApi.get).mockResolvedValue(getResponse)

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    await render(<AdminErrorLogs />)
    await waitFor(() => {
      expect(screen.getByText('Test error message for copy')).toBeInTheDocument()
    })

    const viewButton = screen.getByRole('button', { name: /view/i })
    await userEvent.click(viewButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /error log details/i })).toBeInTheDocument()
    })

    const copyButton = screen.getByRole('button', { name: /copy for llm/i })
    await userEvent.click(copyButton)

    const expectedPrompt = formatErrorLogForLLM(mockErrorLog)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(expectedPrompt)
  })
})
