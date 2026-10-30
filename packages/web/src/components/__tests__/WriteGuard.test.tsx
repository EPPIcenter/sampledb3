import { describe, it, expect, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { render, screen } from '../../__tests__/helpers/render'
import WriteGuard from '../WriteGuard'

const mockUseUser = vi.fn()
vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => mockUseUser() }
})

async function renderAt(canWrite: boolean) {
  mockUseUser.mockReturnValue({ canWrite })
  await render(
    <Routes>
      <Route path="/" element={<span>Home</span>} />
      <Route
        path="/move"
        element={
          <WriteGuard redirectTo="/">
            <span>Protected content</span>
          </WriteGuard>
        }
      />
    </Routes>,
    { initialEntries: ['/move'] },
  )
}

describe('WriteGuard', () => {
  it('renders children for a user who can write', async () => {
    await renderAt(true)
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('redirects a read-only user without rendering children', async () => {
    await renderAt(false)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })
})
