import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen } from '../../__tests__/helpers/render'
import CollectionDeleteButton from '../CollectionDeleteButton'

const userState = vi.hoisted(() => ({ isAdmin: false }))

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ isAdmin: userState.isAdmin }),
  }
})

describe('CollectionDeleteButton', () => {
  beforeEach(() => {
    userState.isAdmin = false
  })

  it('shows the delete trigger to an admin and calls onClick', async () => {
    userState.isAdmin = true
    const onClick = vi.fn()
    await render(<CollectionDeleteButton onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: /Delete collection/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('hides the delete trigger from a non-admin (member or viewer)', async () => {
    await render(<CollectionDeleteButton onClick={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Delete collection/i })).not.toBeInTheDocument()
  })
})
