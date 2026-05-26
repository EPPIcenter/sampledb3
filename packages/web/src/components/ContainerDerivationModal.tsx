import { useState, useEffect } from 'react'
import { derivationsApi, specimenTypesApi, collectionsApi, type SpecimenType, type CreateDerivationPayload } from '../lib/api'
import type { CollectionOption, CollectionSelectValue } from './CollectionSelectOrCreate'
import CollectionSelectOrCreate from './CollectionSelectOrCreate'
import ModalPortal from './ModalPortal'
import { DERIVATION_TYPES } from '../lib/derivation-types'
import '../styles/storage.css'

interface ContainerDerivationModalProps {
  isOpen: boolean
  onClose: () => void
  parentContainerId: number
  parentContainer?: {
    remainingQuantity?: number
    unit?: { symbol: string }
    containerType?: string
    barcode?: string
    position?: string
    label?: string
    specimenTypeName?: string
  }
  onSuccess: () => void
  /** Pass a key that increments when opening to reset inner state; parent should increment in the open handler. */
  openKey?: number
}

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
  { value: 'static_well', label: 'Static Well' },
]

type ContainerDerivationModalContentProps = {
  parentContainerId: number
  parentContainer?: ContainerDerivationModalProps['parentContainer']
  onClose: () => void
  onSuccess: () => void
}

function ContainerDerivationModalContent({
  parentContainerId,
  parentContainer,
  onClose,
  onSuccess,
}: ContainerDerivationModalContentProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [allowedContainerTypes, setAllowedContainerTypes] = useState<string[]>([])
  const [collectionOptions, setCollectionOptions] = useState<CollectionOption[]>([])

  const [formData, setFormData] = useState<CreateDerivationPayload>({
    derivationType: 'dna_extraction',
    specimenTypeName: '',
    containerType: 'micronix_tube',
    quantity: 1.0,
    unitSymbol: '',
    quantityUsed: undefined,
    reduceParentQuantity: true,
    derivationDate: new Date().toISOString().split('T')[0],
    protocol: '',
    notes: '',
    properties: undefined,
    collectionId: undefined,
    collectionName: undefined,
    collectionType: undefined,
    collectionLocationId: undefined,
    containerBarcode: '',
    position: '',
  })

  const effectiveCollectionType: 'micronix_plate' | 'cryovial_box' | 'sheet' | null =
    formData.containerType === 'micronix_tube'
      ? 'micronix_plate'
      : formData.containerType === 'cryovial_tube'
        ? 'cryovial_box'
        : formData.containerType === 'paper'
          ? 'sheet'
          : null

  // Load reference data when content mounts (key resets state on each open)
  useEffect(() => {
    loadReferenceData()
  }, [])

  useEffect(() => {
    if (effectiveCollectionType === null) {
      setCollectionOptions([])
      return
    }
    let cancelled = false
    collectionsApi
      .listCollectionsByType(effectiveCollectionType)
      .then((res) => {
        if (cancelled) return
        const options: CollectionOption[] = res.data.collections.map(
          (c: { id: number; name: string; location?: { path: string | null } | null }) => ({
            id: c.id,
            name: c.name,
            locationPath: c.location?.path ?? null,
          })
        )
        setCollectionOptions(options)
      })
      .catch(() => {
        if (!cancelled) setCollectionOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [effectiveCollectionType])

  // Fetch allowed container types when specimen type changes (with ignore for race conditions)
  useEffect(() => {
    if (specimenTypes.length === 0) return

    let ignore = false
    const fetchAllowedContainerTypes = async () => {
      if (!formData.specimenTypeName) {
        if (!ignore) setAllowedContainerTypes([])
        return
      }

      const selectedSpecimenType = specimenTypes.find(st => st.name === formData.specimenTypeName)
      if (!selectedSpecimenType) {
        if (!ignore) setAllowedContainerTypes([])
        return
      }

      try {
        const response = await specimenTypesApi.getContainerTypes(selectedSpecimenType.id)
        if (ignore) return
        const containerTypes = response.data.containerTypes
        setAllowedContainerTypes(containerTypes)

        if (!containerTypes.includes(formData.containerType)) {
          setFormData(prev => ({
            ...prev,
            containerType: containerTypes.length > 0 ? (containerTypes[0] as CreateDerivationPayload['containerType']) : 'micronix_tube',
          }))
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to fetch allowed container types:', err)
          setAllowedContainerTypes([])
        }
      }
    }

    void fetchAllowedContainerTypes()
    return () => {
      ignore = true
    }
  }, [formData.specimenTypeName, specimenTypes])

  const loadReferenceData = async () => {
    try {
      setLoading(true)
      const specimenTypesRes = await specimenTypesApi.list()
      setSpecimenTypes(specimenTypesRes.data)
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string } } }
      console.error('Failed to load reference data:', err)
      setError(errObj.response?.data?.error ?? 'Failed to load reference data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setWarnings([])

    // Validation
    if (!formData.derivationType) {
      setError('Derivation type is required')
      setLoading(false)
      return
    }
    if (!formData.specimenTypeName) {
      setError('Specimen type is required')
      setLoading(false)
      return
    }
    try {
      const payload: CreateDerivationPayload = {
        derivationType: formData.derivationType,
        specimenTypeName: formData.specimenTypeName,
        containerType: formData.containerType,
        quantity: formData.quantity,
        unitSymbol: formData.unitSymbol || undefined,
        quantityUsed: formData.quantityUsed,
        reduceParentQuantity: formData.reduceParentQuantity,
        derivationDate: formData.derivationDate || undefined,
        protocol: formData.protocol || undefined,
        notes: formData.notes || undefined,
        properties: formData.properties,
        collectionId: formData.collectionId,
        collectionName: formData.collectionName,
        collectionType: (formData.containerType === 'micronix_tube'
            ? 'micronix_plate'
            : formData.containerType === 'cryovial_tube'
              ? 'cryovial_box'
              : formData.containerType === 'paper'
                ? 'sheet'
                : undefined) as 'micronix_plate' | 'cryovial_box' | 'sheet' | undefined,
        containerBarcode: formData.containerBarcode || undefined,
        position: formData.position || undefined,
      }

      const response = await derivationsApi.createFromContainer(parentContainerId, payload)
      
      if (response.data.warnings.length > 0) {
        setWarnings(response.data.warnings)
        // Still show success but with warnings
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 2000)
      } else {
        onSuccess()
        onClose()
      }
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string; details?: string } } }
      console.error('Failed to create derivation:', err)
      setError(errObj.response?.data?.error ?? errObj.response?.data?.details ?? 'Failed to create derivation')
    } finally {
      setLoading(false)
    }
  }

  const containerTypeLabel =
    parentContainer?.containerType === 'micronix_tube'
      ? 'Micronix tube'
      : parentContainer?.containerType === 'cryovial_tube'
        ? 'Cryovial tube'
        : parentContainer?.containerType === 'paper'
          ? 'Paper'
          : parentContainer?.containerType ?? 'Container'
  const sourceParts: string[] = []
  if (parentContainer?.barcode) sourceParts.push(parentContainer.barcode)
  if (parentContainer?.position) sourceParts.push(parentContainer.position)
  if (parentContainer?.label) sourceParts.push(parentContainer.label)
  if (parentContainer?.specimenTypeName) sourceParts.push(parentContainer.specimenTypeName)
  const sourceSummary = sourceParts.length > 0 ? sourceParts.join(' · ') : containerTypeLabel

  return (
    <div className="relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:max-h-[90vh]">
      <div className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-app-text">Create Derivation</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-app-text-muted hover:text-app-text transition-colors"
            disabled={loading}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
            {error}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
            <div className="font-semibold mb-1">Warnings:</div>
            <ul className="list-disc list-inside">
              {warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Source (read-only) */}
          <div className="p-3 rounded-md border bg-app-surface border-app-border">
            <label className="block text-xs font-medium text-app-text-muted mb-1">Source container</label>
            <p className="text-sm font-medium text-app-text">{sourceSummary}</p>
          </div>

          {/* Derivation type */}
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">
              Derivation type <span className="text-app-trend-down">*</span>
            </label>
            <select
              value={formData.derivationType}
              onChange={(e) => setFormData({ ...formData, derivationType: e.target.value })}
              className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
              required
              disabled={loading}
            >
              {DERIVATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Derived specimen type */}
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">
              Derived specimen type <span className="text-app-trend-down">*</span>
            </label>
            <select
              value={formData.specimenTypeName}
              onChange={(e) => setFormData({ ...formData, specimenTypeName: e.target.value })}
              className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
              required
              disabled={loading}
            >
              <option value="">Select specimen type…</option>
              {specimenTypes.map((st) => (
                <option key={st.id} value={st.name}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          {/* Derived container type */}
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">
              Derived container type <span className="text-app-trend-down">*</span>
            </label>
            <select
              value={formData.containerType}
              onChange={(e) => {
                const newType = e.target.value as CreateDerivationPayload['containerType']
                setFormData({ ...formData, containerType: newType, collectionId: undefined, collectionName: undefined })
              }}
              className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
              required
              disabled={loading}
            >
              {(allowedContainerTypes.length > 0
                ? CONTAINER_TYPES.filter((t) => allowedContainerTypes.includes(t.value))
                : CONTAINER_TYPES
              ).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {allowedContainerTypes.length > 0 && (
              <p className="text-xs text-app-text-muted mt-1">
                Allowed for this specimen type: {allowedContainerTypes.map((ct) => CONTAINER_TYPES.find((t) => t.value === ct)?.label ?? ct).join(', ')}
              </p>
            )}
          </div>

          {/* Where to put derived: existing collection */}
          {effectiveCollectionType !== null && (
            <div>
              <CollectionSelectOrCreate
                collectionType={effectiveCollectionType}
                collections={collectionOptions}
                value={
                  formData.collectionName != null && formData.collectionName !== ''
                    ? (formData.collectionId != null
                        ? {
                            id: formData.collectionId,
                            name: formData.collectionName,
                            locationPath: undefined,
                          }
                        : {
                            name: formData.collectionName,
                            id: undefined,
                            locationPath: undefined,
                          })
                    : null
                }
                onChange={(v: CollectionSelectValue | null) => {
                  setFormData((prev) => ({
                    ...prev,
                    collectionId: v?.id,
                    collectionName: v?.name ?? undefined,
                    collectionLocationId: undefined,
                  }))
                }}
                allowCreate={false}
                label="Collection (existing) *"
                placeholder={
                  formData.containerType === 'micronix_tube'
                    ? 'Type to search micronix plate…'
                    : formData.containerType === 'cryovial_tube'
                      ? 'Type to search cryovial box…'
                      : formData.containerType === 'paper'
                        ? 'Type to search sheet…'
                        : 'Type to search collection…'
                }
                disabled={loading}
              />
              <p className="text-xs text-app-text-muted mt-1">
                Search and select an existing collection. Create new plates/boxes from Storage first if needed.
              </p>
            </div>
          )}

          {/* Barcode / position / label for derived container */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-app-text mb-1">
                {formData.containerType === 'paper' ? 'Label' : 'Barcode'}
              </label>
              <input
                type="text"
                value={formData.containerType === 'paper' ? (formData.position || '') : (formData.containerBarcode || '')}
                onChange={(e) =>
                  formData.containerType === 'paper'
                    ? setFormData({ ...formData, position: e.target.value })
                    : setFormData({ ...formData, containerBarcode: e.target.value })
                }
                className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                disabled={loading}
                placeholder={formData.containerType === 'paper' ? 'Spot label' : 'e.g. MTX-001'}
              />
            </div>
            {formData.containerType !== 'paper' && (
              <div>
                <label className="block text-sm font-medium text-app-text mb-1">Position</label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                  disabled={loading}
                  placeholder="e.g. A01"
                />
              </div>
            )}
          </div>

          {/* Derivation date */}
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">Derivation date</label>
            <input
              type="date"
              value={formData.derivationDate}
              onChange={(e) => setFormData({ ...formData, derivationDate: e.target.value })}
              className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
              disabled={loading}
            />
          </div>

          {/* Protocol */}
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">Protocol (optional)</label>
            <input
              type="text"
              value={formData.protocol}
              onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
              className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
              disabled={loading}
              placeholder="Protocol name or reference"
            />
          </div>

          {/* Notes (optional) */}
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">Notes (optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
              disabled={loading}
              placeholder="Additional notes…"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="storage-btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="storage-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create derivation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ContainerDerivationModal({
  isOpen,
  onClose,
  parentContainerId,
  parentContainer,
  onSuccess,
  openKey = 0,
}: ContainerDerivationModalProps) {
  if (!isOpen) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-md"
            onClick={onClose}
          />
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <ContainerDerivationModalContent
            key={`${parentContainerId}-${openKey}`}
            parentContainerId={parentContainerId}
            parentContainer={parentContainer}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </div>
      </div>
    </ModalPortal>
  )
}

