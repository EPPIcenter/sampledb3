import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import ContainerDerivationModal from '../ContainerDerivationModal'

vi.mock('../../lib/api', () => ({
  derivationsApi: {
    create: vi.fn().mockResolvedValue({ data: { derivation: {}, parentContainer: {}, childContainer: {}, specimen: {}, warnings: [] } }),
  },
  specimenTypesApi: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'DNA' }] }),
    getContainerTypes: vi.fn().mockResolvedValue({ data: { containerTypes: ['micronix_tube'] } }),
  },
  collectionsApi: {
    search: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

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
