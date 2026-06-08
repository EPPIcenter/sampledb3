import { useState, useEffect } from 'react'
import { Modal } from '../ui'
import ContainerRegistration, { type ContainerData } from './ContainerRegistration'
import { specimensApi } from '../lib/api/specimens'
import { flatContainerRegistrationToWriteInput } from '../lib/specimen-container-payload'
import { specimenTypesApi } from '../lib/api/reference-data';
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
        if (!cancelled) setAllowedContainerTypes(res.containerTypes)
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
      await specimensApi.addContainer(specimenId, flatContainerRegistrationToWriteInput(containerData))
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
    <Modal isOpen onClose={onClose} title="Add container" contentClassName="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down rounded text-sm text-app-trend-down">
            {error}
          </div>
        )}

        {allowedTypesLoading ? (
          <p className="text-sm text-app-text-muted py-4">Loading allowed container types…</p>
        ) : allowedContainerTypes.length === 0 ? (
          <p className="text-sm text-amber-700 py-4">
            No container types are configured for this specimen type. Configure allowed container types in
            Specimen Types settings.
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
          <button type="button" onClick={onClose} className="subject-specimen-btn-secondary">
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
    </Modal>
  )
}
