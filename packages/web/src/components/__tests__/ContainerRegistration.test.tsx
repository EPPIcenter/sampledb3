import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import ContainerRegistration from '../ContainerRegistration'

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    settingsApi: {
      getValue: vi.fn().mockResolvedValue(null),
      getContainerTypeUnits: vi.fn().mockResolvedValue({ units: [] }),
    },
  })
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
    collectionsApi: { listCollectionsByType: vi.fn().mockResolvedValue({ collections: [] }) },
  })
})

const containerTypeSelect = () => screen.getByText('Container Type *').parentElement?.querySelector('select')

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('locations', {
    locationsApi: { list: vi.fn().mockResolvedValue({ locations: [] }) },
  })
})

describe('ContainerRegistration', () => {
  it('switches to the first allowed container type when the allowed list excludes the current one', async () => {
    const onChange = vi.fn()
    const { rerender } = await render(
      <ContainerRegistration mode="required" allowedContainerTypes={['cryovial_tube', 'paper']} onChange={onChange} />,
    )
    await waitFor(() => expect(containerTypeSelect()).toHaveValue('cryovial_tube'))

    rerender(<ContainerRegistration mode="required" allowedContainerTypes={['paper']} onChange={onChange} />)
    await waitFor(() => expect(containerTypeSelect()).toHaveValue('paper'))
  })
})
