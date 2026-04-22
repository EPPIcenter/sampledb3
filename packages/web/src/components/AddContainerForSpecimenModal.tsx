import { useState, useEffect } from 'react'
import ModalPortal from './ModalPortal'
import ContainerRegistration, { type ContainerData } from './ContainerRegistration'
import { specimensApi, specimenTypesApi } from '../lib/api'
import '../styles/subject-specimen.css'

interface AddContainerForSpecimenModalProps {
  isOpen: boolean
  onClose: () => void
  specimenId: number
  specimenTypeId: number
  onSuccess: () => void
}

export default function AddContainerForSpecimenModal({
  isOpen,
  onClose,
  specimenId,
  specimenTypeId,
  onSuccess,
}: AddContainerForSpecimenModalProps) {
  const [containerData, setContainerData] = useState<ContainerData | null>(null)
  const [containerValid, setContainerValid] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allowedContainerTypes, setAllowedContainerTypes] = useState<string[]>([])
  const [allowedTypesLoading, setAllowedTypesLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !specimenTypeId) return
    let cancelled = false
    setAllowedTypesLoading(true)
    specimenTypesApi
      .getContainerTypes(specimenTypeId)
      .then((res) => {
        if (!cancelled) setAllowedContainerTypes(res.data.containerTypes)
      })
      .catch(() => {
        if (!cancelled) setAllowedContainerTypes([])
      })
      .finally(() => {
        if (!cancelled) setAllowedTypesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, specimenTypeId])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!containerData || !containerValid) return
    setError(null)
    setLoading(true)
    try {
      await specimensApi.addContainer(specimenId, {
        containerType: containerData.containerType,
        collectionName: containerData.collectionName,
        collectionBarcode: containerData.collectionBarcode,
        barcode: containerData.barcode,
        position: containerData.position,
        label: containerData.label,
        unitId: containerData.unitId,
        totalQuantity: containerData.totalQuantity,
        remainingQuantity: containerData.remainingQuantity,
        comment: containerData.comment,
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(message || 'Failed to add container')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-md"
            onClick={onClose}
            aria-hidden
          />
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
            &#8203;
          </span>
          <div
            className="relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full"
            role="dialog"
            aria-labelledby="add-container-dialog-title"
            aria-modal="true"
          >
            <form onSubmit={handleSubmit} className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 id="add-container-dialog-title" className="text-lg font-semibold text-app-text">
                  Add container
                </h2>
                <button
                  type="button"
                  className="text-app-text-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent rounded"
                  onClick={onClose}
                  aria-label="Close"
                >
                  &#215;
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down rounded text-sm text-app-trend-down">
                  {error}
                </div>
              )}

              {allowedTypesLoading ? (
                <p className="text-sm text-app-text-muted py-4">Loading allowed container types…</p>
              ) : allowedContainerTypes.length === 0 ? (
                <p className="text-sm text-amber-700 py-4">
                  No container types are configured for this specimen type. Configure allowed container types in Specimen Types settings.
                </p>
              ) : (
                <ContainerRegistration
                  mode="required"
                  allowedContainerTypes={allowedContainerTypes}
                  onChange={(data) => setContainerData(data)}
                  onValidationChange={(isValid) => setContainerValid(isValid)}
                />
              )}

              <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-app-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="subject-specimen-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !containerValid || allowedTypesLoading || allowedContainerTypes.length === 0}
                  className="subject-specimen-btn-primary disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add container'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
