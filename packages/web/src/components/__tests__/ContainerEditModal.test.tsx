import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import ContainerEditModal from '../ContainerEditModal'

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', {
    tagsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  })
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    settingsApi: { getContainerTypeUnits: vi.fn().mockResolvedValue({ units: [] }) },
  })
})

describe('ContainerEditModal', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves a cleared comment', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    await render(
      <ContainerEditModal
        isOpen
        onClose={() => {}}
        onSuccess={onSuccess}
        container={{ id: 7, comment: 'Thawed once', containerType: 'static_well' }}
      />,
    )

    await user.clear(screen.getByLabelText('Comment'))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/containers/7')
    expect(JSON.parse(init.body as string)).toEqual({ comment: '' })
  })
})
