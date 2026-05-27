import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import ContainerDerivationModal from '../ContainerDerivationModal'

const sharedMocks = vi.hoisted(() => ({
  derivationsApi: {
    createFromContainer: vi.fn().mockResolvedValue({
      derivation: {},
      parentContainer: {},
      childContainer: {},
      specimen: {},
      warnings: [] as string[],
    }),
  },
  specimenTypesApi: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'DNA' }] }),
    getContainerTypes: vi.fn().mockResolvedValue({ containerTypes: ['micronix_tube'] }),
  },
  collectionsApi: {
    listCollectionsByType: vi.fn().mockResolvedValue({ collections: [] }),
  },
}))

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', sharedMocks)
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
    collectionsApi: sharedMocks.collectionsApi,
  })
})

vi.mock('../../lib/api/derivations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('derivations', {
    derivationsApi: sharedMocks.derivationsApi,
  })
})

describe('ContainerDerivationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    await render(
      <ContainerDerivationModal
        isOpen={false}
        onClose={onClose}
        parentContainerId={1}
        onSuccess={onSuccess}
      />
    )
    expect(screen.queryByText(/create derivation|derived specimen type/i)).not.toBeInTheDocument()
  })

  it('renders form when open with Create derivation button', async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    await render(
      <ContainerDerivationModal
        isOpen={true}
        onClose={onClose}
        parentContainerId={1}
        parentContainer={{ specimenTypeName: 'Blood', remainingQuantity: 1 }}
        onSuccess={onSuccess}
      />
    )
    expect(screen.getByRole('button', { name: /create derivation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })
})
