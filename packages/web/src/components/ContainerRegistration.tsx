import { useState, useEffect, useRef } from 'react'
import CollectionSelectOrCreate, {
  type CollectionOption,
  type CollectionSelectValue,
  type CollectionType,
} from './CollectionSelectOrCreate'
import { collectionsApi } from '../lib/api/collections';
import { settingsApi } from '../lib/api/settings';
import { unitsApi } from '../lib/api/reference-data';
import type { ContainerDefaults } from '../lib/api/settings';
import type { Unit } from '../lib/api/types'
import CollectionAssignment, {
  type CollectionAssignmentChange,
} from './wizards/CollectionAssignment'

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

export interface ContainerData {
  containerType: ContainerType
  /** Paper sheet parent collection type (default box). */
  parentCollectionType?: 'box' | 'bag'
  collectionName?: string
  collectionBarcode?: string
  collectionLocationId?: number
  barcode?: string
  position?: string
  sheetName?: string
  sublabel?: string
  statusId?: number
  comment?: string
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
}

const CONTAINER_TYPE_OPTIONS: { value: ContainerType; label: string }[] = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
  { value: 'static_well', label: 'Static Well' },
]

interface ContainerRegistrationProps {
  /** When 'hidden', component returns null. Parent should clear its container value when passing mode='hidden'. */
  mode: 'required' | 'optional' | 'hidden'
  containerType?: ContainerType
  /** When set, only these container types are shown in the type dropdown (e.g. from specimen type's allowed types). */
  allowedContainerTypes?: string[]
  defaultValue?: ContainerData
  onChange: (data: ContainerData | null) => void
  onValidationChange?: (isValid: boolean) => void
}

export default function ContainerRegistration({
  mode,
  containerType: initialContainerType,
  allowedContainerTypes = [],
  defaultValue,
  onChange,
  onValidationChange,
}: ContainerRegistrationProps) {
  const [enabled, setEnabled] = useState(mode === 'required' || (mode === 'optional' && !!defaultValue))
  const [containerType, setContainerType] = useState<ContainerType>(initialContainerType || 'micronix_tube')
  const [formData, setFormData] = useState<ContainerData>({
    containerType: initialContainerType || 'micronix_tube',
    parentCollectionType: defaultValue?.parentCollectionType ?? 'box',
    collectionName: defaultValue?.collectionName || '',
    collectionBarcode: defaultValue?.collectionBarcode || '',
    collectionLocationId: defaultValue?.collectionLocationId,
    barcode: defaultValue?.barcode || '',
    position: defaultValue?.position || '',
    sheetName: defaultValue?.sheetName || '',
    sublabel: defaultValue?.sublabel || '',
    comment: defaultValue?.comment || '',
    unitId: defaultValue?.unitId,
    totalQuantity: defaultValue?.totalQuantity,
    remainingQuantity: defaultValue?.remainingQuantity,
  })
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [units, setUnits] = useState<Unit[]>([])
  const [defaultUnitSymbol, setDefaultUnitSymbol] = useState<string | null>(null)
  const [defaultQuantityDisplay, setDefaultQuantityDisplay] = useState<{ totalQuantity: number; remainingQuantity: number } | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<number | undefined>(defaultValue?.unitId)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [defaultUnitError, setDefaultUnitError] = useState<string | null>(null)
  const [collectionOptions, setCollectionOptions] = useState<CollectionOption[]>([])
  const [collectionSelectedId, setCollectionSelectedId] = useState<number | undefined>(undefined)
  const [collectionLocationPath, setCollectionLocationPath] = useState<string | null>(null)

  const getCollectionListType = (): CollectionType => {
    switch (containerType) {
      case 'micronix_tube':
      case 'static_well':
        return 'micronix_plate'
      case 'cryovial_tube':
        return 'cryovial_box'
      case 'paper':
        return formData.parentCollectionType ?? 'box'
      default:
        return 'box'
    }
  }

  const effectiveCollectionType = getCollectionListType()
  const paperParentType = formData.parentCollectionType ?? 'box'

  const handlePaperCollectionAssignment = (updates: CollectionAssignmentChange) => {
    setFormData((prev) => {
      const next = { ...prev }
      if (updates.collectionType !== undefined) {
        const prevType = prev.parentCollectionType ?? 'box'
        const parentType: 'box' | 'bag' = updates.collectionType === 'bag' ? 'bag' : 'box'
        next.parentCollectionType = parentType
        if (parentType !== prevType) {
          next.collectionName = ''
          next.collectionLocationId = undefined
        }
      }
      if (updates.collectionName !== undefined) {
        next.collectionName = updates.collectionName
      }
      if (updates.collectionLocationId !== undefined) {
        next.collectionLocationId = updates.collectionLocationId ?? undefined
      }
      return next
    })
    if (updates.collectionId !== undefined) {
      setCollectionSelectedId(updates.collectionId)
    }
    if (updates.collectionName === '') {
      setCollectionSelectedId(undefined)
      setCollectionLocationPath(null)
    }
  }

  // When allowed types are restricted and current type is not allowed, reset to first allowed
  useEffect(() => {
    if (allowedContainerTypes.length > 0 && !allowedContainerTypes.includes(containerType)) {
      const first = allowedContainerTypes[0] as ContainerType
      setContainerType(first)
      setFormData((prev) => ({ ...prev, containerType: first }))
    }
  }, [allowedContainerTypes])

  useEffect(() => {
    const cancelled = { current: false }
    loadUnits()
    const run = async () => {
      try {
        setDefaultUnitError(null)
        const defaults = await settingsApi.getValue('container_defaults')
        if (cancelled.current) return
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check for container type in defaults
        if (defaults && defaults[containerType]) {
          const typeDefaults = defaults[containerType]
          setDefaultUnitSymbol(typeDefaults.defaultUnitSymbol)
          setDefaultQuantityDisplay({
            totalQuantity: typeDefaults.totalQuantity,
            remainingQuantity: typeDefaults.remainingQuantity,
          })
          if (!selectedUnitId && !defaultValue?.unitId) {
            const resUnits = await unitsApi.listAll()
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- effect cleanup can set cancelled.current between awaits
            if (cancelled.current) return
            const defaultUnit = resUnits.find((u: Unit) => u.symbol === typeDefaults.defaultUnitSymbol)
            if (defaultUnit) setSelectedUnitId(defaultUnit.id)
          }
        } else {
          setDefaultQuantityDisplay(null)
        }
      } catch (err: unknown) {
        if (cancelled.current) return
        const errorMessage = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
        setDefaultUnitError(errorMessage || (err instanceof Error ? err.message : 'Failed to load default unit settings'))
        setDefaultQuantityDisplay(null)
        console.error('Failed to load default unit:', err)
      }
    }
    run()
    return () => {
      cancelled.current = true
    }
  }, [containerType])

  useEffect(() => {
    const type = effectiveCollectionType
    setCollectionSelectedId(undefined)
    setCollectionLocationPath(null)
    if (
      type !== 'micronix_plate' &&
      type !== 'cryovial_box' &&
      type !== 'box' &&
      type !== 'bag'
    ) {
      return
    }
    let cancelled = false
    collectionsApi.listCollectionsByType(type).then((res) => {
      if (cancelled) return
      const options: CollectionOption[] = res.collections.map(
        (c: { id: number; name: string; location?: { path: string | null } | null }) => ({
          id: c.id,
          name: c.name,
          locationPath: c.location?.path ?? null,
        })
      )
      setCollectionOptions(options)
    }).catch(() => {
      if (!cancelled) setCollectionOptions([])
    })
    return () => {
      cancelled = true
    }
  }, [effectiveCollectionType, containerType, paperParentType])

  const loadUnits = async () => {
    try {
      setUnitsError(null)
      // Load units filtered by container type
      const res = await settingsApi.getContainerTypeUnits(containerType)
      setUnits(res.units)
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error ?? err?.message ?? 'Failed to load units for this container type'
      setUnitsError(errorMessage)
      setUnits([])
      console.error('Failed to load units:', err)
      // Don't fallback - show error to user instead
    }
  }

  const isInitialMount = useRef(true)
  // When container type or unit changes (after mount), clear quantity fields so placeholder (default) text shows again
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    setFormData((prev) => ({
      ...prev,
      totalQuantity: undefined,
      remainingQuantity: undefined,
    }))
  }, [containerType, selectedUnitId])

  // Sync derived container data to parent when form state changes. Do not notify parent
  // with null here: mode === 'hidden' is the parent's responsibility; optional unchecked
  // is handled in the checkbox handler below.
  useEffect(() => {
    if (mode === 'hidden') return
    if (!enabled && mode === 'optional') return
    updateContainerData()
  }, [enabled, containerType, formData, mode, selectedUnitId])

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.collectionName && !formData.collectionBarcode) {
      errors.collection = 'Collection name or barcode is required'
    }

    if (containerType === 'micronix_tube' && !formData.barcode) {
      errors.barcode = 'Barcode is required for micronix tubes'
    }

    if ((containerType === 'micronix_tube' || containerType === 'cryovial_tube') && !formData.position) {
      errors.position = 'Position is required for ' + (containerType === 'micronix_tube' ? 'micronix tubes' : 'cryovial tubes')
    }

    if (containerType === 'paper' && !formData.sheetName) {
      errors.sheetName = 'Sheet name is required for papers'
    }

    setValidationErrors(errors)
    const isValid = Object.keys(errors).length === 0

    if (onValidationChange) {
      onValidationChange(isValid)
    }

    return isValid
  }

  const updateContainerData = () => {
    const data: ContainerData = {
      ...formData,
      unitId: selectedUnitId,
    }

    if (validateForm()) {
      onChange(data)
    } else {
      onChange(null)
    }
  }

  const handleFieldChange = (field: keyof ContainerData, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value }
      return updated
    })
  }

  if (mode === 'hidden') {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-app-text">Container Registration</h3>
        {mode === 'optional' && (
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                const checked = e.target.checked
                setEnabled(checked)
                if (!checked) {
                  onChange(null)
                  onValidationChange?.(true)
                }
              }}
              className="h-4 w-4 text-app-accent focus:ring-app-accent border-app-border rounded"
            />
            <span className="text-sm text-app-text">Add Container</span>
          </label>
        )}
      </div>

      {enabled && (
        <div className="space-y-4 bg-app-surface/50 p-5 rounded-lg border border-app-border/60">
          {/* Container Type Selector */}
          {!initialContainerType && (
            <div>
              <label className="block text-sm font-medium text-app-text mb-2">
                Container Type *
              </label>
              <select
                value={containerType}
                onChange={(e) => {
                  setContainerType(e.target.value as ContainerType)
                  handleFieldChange('containerType', e.target.value)
                }}
                className="form-select"
              >
                {(allowedContainerTypes.length > 0
                  ? CONTAINER_TYPE_OPTIONS.filter((t) => allowedContainerTypes.includes(t.value))
                  : CONTAINER_TYPE_OPTIONS
                ).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {allowedContainerTypes.length > 0 && (
                <p className="text-xs text-app-text-muted mt-1">
                  Allowed for this specimen type: {allowedContainerTypes.map((ct) => CONTAINER_TYPE_OPTIONS.find((t) => t.value === ct)?.label ?? ct).join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="space-y-4">
              {/* Collection Selection */}
              {containerType === 'paper' ? (
                <div>
                  <CollectionAssignment
                    containerType="paper"
                    collectionType={paperParentType}
                    collectionName={formData.collectionName ?? ''}
                    collectionLocationId={formData.collectionLocationId ?? null}
                    collectionId={collectionSelectedId}
                    collectionOptions={collectionOptions}
                    allowCreateCollection
                    onChange={handlePaperCollectionAssignment}
                  />
                  {validationErrors.collection && (
                    <p className="mt-1 text-sm text-app-trend-down">{validationErrors.collection}</p>
                  )}
                </div>
              ) : (
                <div>
                  <CollectionSelectOrCreate
                    collectionType={effectiveCollectionType}
                    collections={collectionOptions}
                    value={
                      formData.collectionName
                        ? (collectionSelectedId != null
                            ? {
                                id: collectionSelectedId,
                                name: formData.collectionName,
                                locationPath: collectionLocationPath ?? undefined,
                              }
                            : { name: formData.collectionName, id: undefined, locationPath: undefined })
                        : null
                    }
                    onChange={(v: CollectionSelectValue | null) => {
                      if (v == null) {
                        handleFieldChange('collectionName', '')
                        handleFieldChange('collectionBarcode', '')
                        setCollectionSelectedId(undefined)
                        setCollectionLocationPath(null)
                        return
                      }
                      handleFieldChange('collectionName', v.name)
                      handleFieldChange('collectionBarcode', '')
                      setCollectionSelectedId(v.id)
                      setCollectionLocationPath(v.locationPath ?? null)
                    }}
                    allowCreate
                    label={`Collection (${effectiveCollectionType === 'micronix_plate' ? 'Plate' : 'Box'}) *`}
                    placeholder={
                      effectiveCollectionType === 'micronix_plate'
                        ? 'Type to search or enter plate name'
                        : 'Type to search or enter box name'
                    }
                  />
                  {validationErrors.collection && (
                    <p className="mt-1 text-sm text-app-trend-down">{validationErrors.collection}</p>
                  )}
                </div>
              )}

              {/* Container-specific fields */}
              {containerType === 'micronix_tube' && (
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Barcode * (Globally Unique)
                  </label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={(e) => handleFieldChange('barcode', e.target.value)}
                    placeholder="Enter barcode"
                    className={`form-input ${validationErrors.barcode ? 'border-app-trend-down' : ''}`}
                  />
                  {validationErrors.barcode && (
                    <p className="mt-1 text-sm text-app-trend-down">{validationErrors.barcode}</p>
                  )}
                </div>
              )}

              {containerType === 'cryovial_tube' && (
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Barcode (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={(e) => handleFieldChange('barcode', e.target.value)}
                    placeholder="Enter barcode (optional)"
                    className="form-input"
                  />
                </div>
              )}

              {(containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well') && (
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Position {containerType === 'micronix_tube' || containerType === 'cryovial_tube' ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    value={formData.position || ''}
                    onChange={(e) => handleFieldChange('position', e.target.value)}
                    placeholder="e.g., A01, B12"
                    className={`form-input ${validationErrors.position ? 'border-app-trend-down' : ''}`}
                  />
                  {validationErrors.position && (
                    <p className="mt-1 text-sm text-app-trend-down">{validationErrors.position}</p>
                  )}
                </div>
              )}

              {containerType === 'paper' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-app-text mb-2">
                      Sheet name *
                    </label>
                    <input
                      type="text"
                      value={formData.sheetName || ''}
                      onChange={(e) => handleFieldChange('sheetName', e.target.value)}
                      placeholder="Sheet grouping name"
                      className={`form-input ${validationErrors.sheetName ? 'border-app-trend-down' : ''}`}
                    />
                    {validationErrors.sheetName && (
                      <p className="mt-1 text-sm text-app-trend-down">{validationErrors.sheetName}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-app-text mb-2">
                      Spot label (optional)
                    </label>
                    <input
                      type="text"
                      value={formData.sublabel || ''}
                      onChange={(e) => handleFieldChange('sublabel', e.target.value)}
                      placeholder="Optional spot identifier"
                      className="form-input"
                    />
                  </div>
                </>
              )}

              {/* Unit Selection */}
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Unit (Optional)
                </label>
                {unitsError && (
                  <div className="mb-2 p-2 bg-app-trend-down/10 border border-app-trend-down rounded text-sm text-app-trend-down">
                    {unitsError}
                  </div>
                )}
                {defaultUnitError && (
                  <div className="mb-2 p-2 bg-app-surface border border-app-border rounded text-sm text-app-text">
                    Warning: {defaultUnitError}
                  </div>
                )}
                <select
                  value={selectedUnitId || ''}
                  onChange={(e) => {
                    const unitId = e.target.value ? parseInt(e.target.value) : undefined
                    setSelectedUnitId(unitId)
                  }}
                  className="form-select"
                  disabled={unitsError !== null}
                >
                  <option value="">Use default ({defaultUnitSymbol || 'not set'})</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.symbol} ({unit.name})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-app-text-muted">
                  Select a unit to override the default. If not specified, the default unit for this container type will be used.
                </p>
              </div>

              {/* Optional quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Total quantity (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={formData.totalQuantity ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      handleFieldChange('totalQuantity', v === '' ? undefined : Number(v))
                    }}
                    className="form-input"
                    placeholder={defaultQuantityDisplay != null ? String(defaultQuantityDisplay.totalQuantity) : 'Use default'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Remaining quantity (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={formData.remainingQuantity ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      handleFieldChange('remainingQuantity', v === '' ? undefined : Number(v))
                    }}
                    className="form-input"
                    placeholder={defaultQuantityDisplay != null ? String(defaultQuantityDisplay.remainingQuantity) : 'Use default'}
                  />
                </div>
              </div>
              <p className="text-xs text-app-text-muted -mt-2">
                Leave blank to use the default quantities for this container type.
              </p>

              {/* Optional comment */}
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Comment (Optional)
                </label>
                <textarea
                  value={formData.comment || ''}
                  onChange={(e) => handleFieldChange('comment', e.target.value)}
                  rows={2}
                  className="form-textarea"
                  placeholder="Add any notes about this container"
                />
              </div>
          </div>
        </div>
      )}
    </div>
  )
}

