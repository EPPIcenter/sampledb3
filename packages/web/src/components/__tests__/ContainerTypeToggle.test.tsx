import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ContainerTypeToggle from '../ContainerTypeToggle'
import { ToastContainer } from '../Toast'

function apiError(status: number, error: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error } },
  })
}

describe('ContainerTypeToggle', () => {
  it('marks each allowed container type as pressed', async () => {
    await render(<ContainerTypeToggle specimenTypeId={3} allowedTypes={['cryovial_tube']} onToggle={vi.fn()} />)

    expect(screen.getByRole('button', { name: /cryovial/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /micronix/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('turns a container type on through onToggle', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn().mockResolvedValue(undefined)
    await render(<ContainerTypeToggle specimenTypeId={3} allowedTypes={[]} onToggle={onToggle} />)

    await user.click(screen.getByRole('button', { name: /micronix/i }))

    expect(onToggle).toHaveBeenCalledWith(3, 'micronix_tube', true)
  })

  it('shows the error and keeps the saved state when turning a container type on fails', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn().mockRejectedValue(apiError(500, 'Database is locked'))
    await render(
      <>
        <ContainerTypeToggle specimenTypeId={3} allowedTypes={[]} onToggle={onToggle} />
        <ToastContainer />
      </>
    )

    const micronix = screen.getByRole('button', { name: /micronix/i })
    await user.click(micronix)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add Micronix Tube: Database is locked')
    await waitFor(() => expect(micronix).toBeEnabled())
    expect(micronix).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the error and keeps the saved state when turning a container type off fails', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn().mockRejectedValue(new Error('Network Error'))
    await render(
      <>
        <ContainerTypeToggle specimenTypeId={3} allowedTypes={['cryovial_tube']} onToggle={onToggle} />
        <ToastContainer />
      </>
    )

    const cryovial = screen.getByRole('button', { name: /cryovial/i })
    await user.click(cryovial)

    expect(onToggle).toHaveBeenCalledWith(3, 'cryovial_tube', false)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove Cryovial Tube: Network Error')
    await waitFor(() => expect(cryovial).toBeEnabled())
    expect(cryovial).toHaveAttribute('aria-pressed', 'true')
  })
})
