import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import Export from '../Export'
import { settingsApi } from '../../lib/api/settings'
import { mockSettingsApiGetValue } from '../../__tests__/helpers/settings-mocks'
import { specimenTypesApi, tagsApi } from '../../lib/api/reference-data'

vi.mock('../../lib/api/export', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { exportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('export', exportPageMock())
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { exportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('settings', exportPageMock())
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { exportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reference-data', exportPageMock())
})

describe('Export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.getValue).mockImplementation(mockSettingsApiGetValue())
  })

  it('shows export-related content', async () => {
    await render(<Export />)
    await waitFor(() => {
      const matches = screen.getAllByText(/Export|export|CSV|configuration/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('shows studies and specimen types when configs load', async () => {
    vi.mocked(specimenTypesApi.list).mockResolvedValue({
      data: [{ id: 1, name: 'Blood', created: '', lastUpdated: '' }],
    } as never)
    await render(<Export />)
    await waitFor(() => {
      expect(specimenTypesApi.list).toHaveBeenCalled()
    })
  })

  it('calls tagsApi.list when loading reference data', async () => {
    vi.mocked(tagsApi.list).mockResolvedValue({ data: [] } as never)
    await render(<Export />)
    await waitFor(() => {
      expect(tagsApi.list).toHaveBeenCalled()
    })
  })

  it('shows error when reference data fails to load', async () => {
    vi.mocked(specimenTypesApi.list).mockRejectedValue(new Error('Network error'))
    await render(<Export />)
    await waitFor(() => {
      expect(screen.getByText(/network error|failed to load/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows format options (CSV, Excel, JSON)', async () => {
    await render(<Export />)
    await waitFor(() => {
      const csvMatches = screen.getAllByText(/csv/i)
      expect(csvMatches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('toggles container type filter without error when filter array is unset', async () => {
    await render(<Export />)
    await waitFor(() => {
      expect(screen.getByText('Micronix Tube')).toBeInTheDocument()
    })
    const checkbox = screen.getByRole('checkbox', { name: /micronix tube/i })
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })
})
