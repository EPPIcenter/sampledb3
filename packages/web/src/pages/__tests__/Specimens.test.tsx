import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLocation, useNavigate } from 'react-router-dom'
import { render, screen, fireEvent, waitFor } from '../../__tests__/helpers/render'
import Specimens from '../Specimens'

function BackButton() {
  const navigate = useNavigate()
  return <button onClick={() => void navigate(-1)}>Back</button>
}

function CurrentUrl() {
  const location = useLocation()
  return <output aria-label="url">{location.pathname + location.search}</output>
}

async function renderAt(...initialEntries: string[]) {
  await render(
    <>
      <Specimens />
      <BackButton />
      <CurrentUrl />
    </>,
    { initialEntries },
  )
  return {
    url: () => screen.getByLabelText('url').textContent,
    sourceType: () => screen.getByLabelText('Source Type'),
    search: () => screen.getByPlaceholderText(/Search subject/),
    /** Apply is disabled while the list loads, so wait for it before clicking. */
    apply: async () => {
      const button = screen.getByRole('button', { name: /apply filters/i })
      await waitFor(() => expect(button).toBeEnabled())
      fireEvent.click(button)
    },
  }
}

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: { id: 1, name: 'Test', email: 'test@test.com', role: 'member' },
      loading: false,
      canWrite: true,
    }),
  }
})

vi.mock('../../lib/api/client', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimensPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('client', specimensPageMock())
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimensPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reference-data', specimensPageMock())
})

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('studies', {
    studiesApi: { list: vi.fn().mockResolvedValue({ studies: [] }) },
  })
})

import { api } from '../../lib/api/client'

describe('Specimens page', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ specimens: [] })
  })

  it('renders filters and table area', async () => {
    await render(<Specimens />)
    const specimensHeadings = await screen.findAllByText(/Specimens/i)
    expect(specimensHeadings.length).toBeGreaterThan(0)
  })

  it('shows specimen rows when API returns list', async () => {
    vi.mocked(api.get).mockResolvedValue({
      specimens: [
        {
          id: 1,
          specimenTypeId: 1,
          created: '2024-01-01',
          specimenType: { id: 1, name: 'Whole Blood' },
          studySubject: { id: 1, name: 'SUBJ-001' },
          study: { id: 1, shortCode: 'ST1' },
        },
      ],
    })
    await render(<Specimens />)
    await screen.findByText(/Whole Blood/i)
    expect(screen.getAllByText(/Whole Blood/i).length).toBeGreaterThan(0)
  })
})

describe('Specimens page URL filters', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ specimens: [] })
  })

  it('keeps filter edits local until Apply, and Back undoes the applied change', async () => {
    const page = await renderAt('/specimens')

    fireEvent.change(page.sourceType(), { target: { value: 'subject' } })
    expect(page.url()).toBe('/specimens')

    await page.apply()
    await waitFor(() => expect(page.url()).toBe('/specimens?source_type=subject'))

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(page.url()).toBe('/specimens'))
    expect(page.sourceType()).toHaveValue('')
  })

  it('applies search as it is typed without adding a history entry per keystroke', async () => {
    const page = await renderAt('/start', '/specimens')

    fireEvent.change(page.search(), { target: { value: 'S' } })
    fireEvent.change(page.search(), { target: { value: 'SU' } })
    await waitFor(() => expect(page.url()).toBe('/specimens?search=SU'))

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(page.url()).toBe('/start'))
  })

  it('keeps unapplied filter edits while a search is typed', async () => {
    const page = await renderAt('/specimens')

    fireEvent.change(page.sourceType(), { target: { value: 'control' } })
    fireEvent.change(page.search(), { target: { value: 'QC' } })
    await waitFor(() => expect(page.url()).toBe('/specimens?search=QC'))
    expect(page.sourceType()).toHaveValue('control')

    await page.apply()
    await waitFor(() => expect(page.url()).toBe('/specimens?source_type=control&search=QC'))
  })

  it('clears applied filters with Clear All', async () => {
    const page = await renderAt('/specimens?source_type=subject')
    expect(page.sourceType()).toHaveValue('subject')

    // Clear All is disabled while the list loads.
    const clearAll = screen.getByRole('button', { name: 'Clear All' })
    await waitFor(() => expect(clearAll).toBeEnabled())
    fireEvent.click(clearAll)

    await waitFor(() => expect(page.url()).toBe('/specimens'))
    expect(page.sourceType()).toHaveValue('')
  })
})
