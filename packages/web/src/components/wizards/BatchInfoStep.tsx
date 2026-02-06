import { useState, useEffect, useRef, useMemo } from 'react'
import { controlsApi, strainsApi } from '../../lib/api'
import type { ControlDefinition, Strain } from '../../lib/api'
import type { BatchInfo } from '../../pages/ControlBatchWizard'
import ModalPortal from '../ModalPortal'
import ControlDefinitionForm from '../forms/ControlDefinitionForm'

const STRAIN_BAR_COLORS = [
  'rgb(var(--dashboard-accent))',
  'rgb(100 116 139)',   /* slate */
  'rgb(245 158 11)',    /* amber */
  'rgb(190 18 60)',     /* blood-controls-badge */
  'rgb(6 182 212)',     /* cyan */
]

interface BatchInfoStepProps {
  batchInfo: BatchInfo
  onChange: (info: BatchInfo) => void
  onNext: () => void
  onCancel: () => void
  isAddMode: boolean
}

export default function BatchInfoStep({
  batchInfo,
  onChange,
  onNext,
  onCancel,
  isAddMode,
}: BatchInfoStepProps) {
  const [definitions, setDefinitions] = useState<ControlDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [nameSuggestion, setNameSuggestion] = useState<string | null>(null)
  const [localName, setLocalName] = useState(batchInfo.name)
  const [searchQuery, setSearchQuery] = useState('')
  const [strainFilters, setStrainFilters] = useState<string[]>([])
  const [strainMatchMode, setStrainMatchMode] = useState<'contains' | 'exact'>('contains')
  const [minDensity, setMinDensity] = useState('')
  const [maxDensity, setMaxDensity] = useState('')
  const [strains, setStrains] = useState<Strain[]>([])
  const [listFocusedIndex, setListFocusedIndex] = useState(-1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const prevBatchNameRef = useRef(batchInfo.name)

  useEffect(() => {
    loadDefinitions()
    loadStrains()
  }, [])

  const loadStrains = async () => {
    try {
      const response = await strainsApi.list()
      setStrains(response.data ?? [])
    } catch (err) {
      console.error('Failed to load strains:', err)
    }
  }

  useEffect(() => {
    if (batchInfo.controlDefinitionId && !batchInfo.controlDefinition) {
      loadDefinition(batchInfo.controlDefinitionId)
    }
  }, [batchInfo.controlDefinitionId])

  // Client-side filter by search, strains, and density
  const filteredDefinitions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return definitions.filter((def) => {
      const matchesSearch =
        !q ||
        def.name.toLowerCase().includes(q) ||
        (def.description || '').toLowerCase().includes(q) ||
        def.strains?.some((s) => (s.name || '').toLowerCase().includes(q))
      const defStrainIds = (def.strains ?? []).map((s) => s.id.toString())
      const matchesContains =
        strainFilters.length === 0 ||
        strainFilters.every((id) => def.strains?.some((s) => s.id.toString() === id))
      const matchesExact =
        strainFilters.length === 0 ||
        (strainFilters.length === defStrainIds.length && strainFilters.every((id) => defStrainIds.includes(id)))
      const matchesStrain = strainMatchMode === 'exact' ? matchesExact : matchesContains
      const min = minDensity ? parseFloat(minDensity) : undefined
      const max = maxDensity ? parseFloat(maxDensity) : undefined
      const matchesMinDensity = min == null || (def.targetDensity != null && def.targetDensity >= min)
      const matchesMaxDensity = max == null || (def.targetDensity != null && def.targetDensity <= max)
      return matchesSearch && matchesStrain && matchesMinDensity && matchesMaxDensity
    })
  }, [definitions, searchQuery, strainFilters, strainMatchMode, minDensity, maxDensity])

  useEffect(() => {
    setListFocusedIndex(-1)
  }, [searchQuery, strainFilters, strainMatchMode, minDensity, maxDensity, filteredDefinitions.length])

  useEffect(() => {
    if (listFocusedIndex >= 0 && optionRefs.current[listFocusedIndex]) {
      optionRefs.current[listFocusedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [listFocusedIndex])

  // Sync local name with batchInfo when it changes externally (during render to avoid extra pass)
  if (batchInfo.name !== prevBatchNameRef.current) {
    prevBatchNameRef.current = batchInfo.name
    setLocalName(batchInfo.name)
  }

  const loadDefinitions = async () => {
    try {
      setLoading(true)
      const response = await controlsApi.list()
      setDefinitions(response.data.controls || [])
    } catch (err) {
      console.error('Failed to load control definitions:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadDefinition = async (id: number) => {
    try {
      const response = await controlsApi.get(id)
      onChange({
        ...batchInfo,
        controlDefinition: response.data.control,
      })
    } catch (err) {
      console.error('Failed to load control definition:', err)
    }
  }

  const applyDefinitionSelection = async (definition: ControlDefinition | null) => {
    const definitionId = definition?.id ?? null

    let suggestedName = ''
    if (definition) {
      try {
        const response = await controlsApi.suggestBatchName(definition.id, batchInfo.productionDate || undefined)
        suggestedName = response.data.name
        setNameSuggestion(suggestedName)
      } catch (err) {
        console.error('Failed to generate suggested batch name:', err)
        const date = batchInfo.productionDate || new Date().toISOString().split('T')[0]
        suggestedName = `${definition.name} ${date}`
        setNameSuggestion(null)
      }
    } else {
      setNameSuggestion(null)
    }

    onChange({
      ...batchInfo,
      controlDefinitionId: definitionId,
      controlDefinition: definition ?? null,
      name: definition ? suggestedName : '',
    })
  }

  const handleDefinitionChange = async (definitionId: number | null, definitionOverride?: ControlDefinition | null) => {
    const definition =
      definitionOverride !== undefined
        ? definitionOverride
        : definitionId
          ? definitions.find((d) => d.id === definitionId) || null
          : null
    await applyDefinitionSelection(definition)
  }

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (isAddMode) return
    if (filteredDefinitions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setListFocusedIndex((i) => (i < filteredDefinitions.length - 1 ? i + 1 : i))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setListFocusedIndex((i) => (i > 0 ? i - 1 : -1))
    } else if (e.key === 'Enter' && listFocusedIndex >= 0 && filteredDefinitions[listFocusedIndex]) {
      e.preventDefault()
      handleDefinitionChange(filteredDefinitions[listFocusedIndex].id)
    }
  }

  const handleCreateSuccess = async (control: ControlDefinition | undefined) => {
    if (!control) return
    setShowCreateModal(false)
    setDefinitions((prev) => (prev.some((d) => d.id === control.id) ? prev : [...prev, control]))
    await applyDefinitionSelection(control)
  }

  // Update suggested name when production date changes
  useEffect(() => {
    if (batchInfo.controlDefinitionId && batchInfo.productionDate && !isAddMode && definitions.length > 0) {
      const definition = definitions.find(d => d.id === batchInfo.controlDefinitionId)
      if (definition) {
        controlsApi.suggestBatchName(definition.id, batchInfo.productionDate)
          .then(response => {
            // Only update name if it's empty or matches the previous suggestion
            if (!batchInfo.name || batchInfo.name === nameSuggestion) {
              onChange({ ...batchInfo, name: response.data.name })
            }
            setNameSuggestion(response.data.name)
          })
          .catch(err => {
            console.error('Failed to generate suggested batch name:', err)
          })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchInfo.productionDate, batchInfo.controlDefinitionId])

  const handleNameChange = (name: string) => {
    // Update local state immediately (no re-render from parent)
    setLocalName(name)
    // Update parent state (but this won't cause focus loss since we're using local state)
    onChange({ ...batchInfo, name })
    
    // Clear previous errors
    if (errors.name) {
      setErrors({ ...errors, name: '' })
    }
    setNameSuggestion(null)
  }

  // Debounced validation
  useEffect(() => {
    if (!localName.trim() || !batchInfo.controlDefinitionId) {
      setValidating(false)
      return
    }

    const timeoutId = setTimeout(async () => {
      setValidating(true)
      try {
        const response = await controlsApi.validateBatchName(localName.trim())
        if (!response.data.valid) {
          setErrors(prev => ({ ...prev, name: response.data.error || 'Batch name is invalid' }))
          if (response.data.suggestion) {
            setNameSuggestion(response.data.suggestion)
          }
        } else {
          setErrors(prev => ({ ...prev, name: '' }))
          setNameSuggestion(null)
        }
      } catch (err) {
        console.error('Failed to validate batch name:', err)
        // Don't block user input on validation error
      } finally {
        setValidating(false)
      }
    }, 500) // Debounce 500ms

    return () => clearTimeout(timeoutId)
  }, [localName, batchInfo.controlDefinitionId])

  const validate = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {}

    if (!batchInfo.controlDefinitionId) {
      newErrors.controlDefinitionId = 'Control definition is required'
    }

    if (!batchInfo.name.trim()) {
      newErrors.name = 'Batch name is required'
    } else {
      // Validate batch name with API
      setValidating(true)
      try {
        const response = await controlsApi.validateBatchName(batchInfo.name.trim())
        if (!response.data.valid) {
          newErrors.name = response.data.error || 'Batch name is invalid'
          if (response.data.suggestion) {
            setNameSuggestion(response.data.suggestion)
          }
        }
      } catch (err) {
        console.error('Failed to validate batch name:', err)
        newErrors.name = 'Failed to validate batch name. Please try again.'
      } finally {
        setValidating(false)
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = async () => {
    const isValid = await validate()
    if (isValid) {
      onNext()
    }
  }

  const definition = batchInfo.controlDefinition

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Batch Information</h2>
        <p className="text-sm text-gray-600 mb-6">
          {isAddMode
            ? 'Select the control definition for the batch you want to add specimens to.'
            : 'Select a control definition and provide batch details.'}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="control-definition-search" className="block text-sm font-medium text-gray-700 mb-2">
            Control Definition *
          </label>

          {!isAddMode && (
            <div className="mb-4 p-3 rounded-lg border bg-white space-y-3" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="blood-controls-filter-label">Strains</span>
                <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
                  <button
                    type="button"
                    onClick={() => setStrainMatchMode('contains')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${strainMatchMode === 'contains' ? 'blood-controls-pill-selected rounded-none' : 'blood-controls-pill rounded-none border-0'}`}
                  >
                    Contains
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrainMatchMode('exact')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${strainMatchMode === 'exact' ? 'blood-controls-pill-selected rounded-none' : 'blood-controls-pill rounded-none border-0'}`}
                  >
                    Exact
                  </button>
                </div>
                <span className="text-xs" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                  {strainMatchMode === 'contains' ? 'Must contain all selected' : 'Exact strains only'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {strains.map((s) => {
                  const isSelected = strainFilters.includes(s.id.toString())
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setStrainFilters((prev) => prev.filter((id) => id !== s.id.toString()))
                        } else {
                          setStrainFilters((prev) => [...prev, s.id.toString()])
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${isSelected ? 'blood-controls-pill-selected' : 'blood-controls-pill'}`}
                    >
                      {s.name}
                    </button>
                  )
                })}
                {strains.length === 0 && (
                  <span className="text-sm italic" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                    No strains in reference data
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="blood-controls-filter-label">Density range</span>
                <input
                  type="number"
                  placeholder="Min"
                  className="block w-24 px-2 py-1.5 border rounded-lg text-sm bg-white"
                  style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                  value={minDensity}
                  onChange={(e) => setMinDensity(e.target.value)}
                />
                <span className="text-xs font-medium" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                  to
                </span>
                <input
                  type="number"
                  placeholder="Max"
                  className="block w-24 px-2 py-1.5 border rounded-lg text-sm bg-white"
                  style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                  value={maxDensity}
                  onChange={(e) => setMaxDensity(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-2">
            <input
              id="control-definition-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleListKeyDown}
              disabled={isAddMode}
              placeholder="Search by name, description, or strain..."
              aria-label="Search control definitions"
              className={`block flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dashboard-accent))] ${
                errors.controlDefinitionId ? 'border-red-300' : 'border-gray-300'
              } ${isAddMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
            {!isAddMode && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="blood-controls-btn-secondary whitespace-nowrap"
              >
                Create new definition
              </button>
            )}
          </div>
          <div
            ref={listRef}
            role="listbox"
            aria-label="Control definitions"
            tabIndex={0}
            onKeyDown={handleListKeyDown}
            className={`border rounded-lg overflow-hidden ${errors.controlDefinitionId ? 'border-red-300' : 'border-gray-300'}`}
          >
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">Loading definitions...</div>
            ) : filteredDefinitions.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                {definitions.length === 0
                  ? 'No control definitions yet. Create one to get started.'
                  : 'No definitions match. Try a different search or create a new definition.'}
                {!isAddMode && definitions.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="blood-controls-link font-medium"
                    >
                      Create new definition
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto">
                {filteredDefinitions.map((def, index) => {
                  const isSelected = batchInfo.controlDefinitionId === def.id
                  const isFocused = index === listFocusedIndex
                  return (
                    <button
                      key={def.id}
                      ref={(el) => { optionRefs.current[index] = el }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleDefinitionChange(def.id)}
                      className={`w-full px-4 py-3 text-left border-b last:border-b-0 transition-colors blood-controls-definition-option ${
                        isSelected ? 'blood-controls-definition-option-selected' : ''
                      } ${isFocused ? 'blood-controls-definition-option-focused' : ''}`}
                      style={{
                        borderColor: 'rgb(var(--dashboard-border))',
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium" style={{ color: 'rgb(var(--dashboard-text))' }}>
                          {def.name}
                        </span>
                        <span className="blood-controls-badge-inline">{def.controlType.replace('_', ' ')}</span>
                        {def.targetDensity !== undefined && (
                          <span className="text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                            {def.targetDensity.toLocaleString()} {def.unitSymbol || ''}
                          </span>
                        )}
                      </div>
                      {def.strains && def.strains.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          <div
                            className="flex h-1.5 rounded-full overflow-hidden"
                            style={{ backgroundColor: 'rgb(var(--dashboard-surface))' }}
                            role="img"
                            aria-label={def.strains.map((s) => `${s.name} ${s.percentage ?? 0}%`).join(', ')}
                          >
                            {def.strains.map((s, idx) => {
                              const pct = s.percentage ?? 0
                              return (
                                <div
                                  key={s.id}
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: STRAIN_BAR_COLORS[idx % STRAIN_BAR_COLORS.length],
                                  }}
                                  title={`${s.name}: ${pct}%`}
                                />
                              )
                            })}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {def.strains.map((s, idx) => (
                              <span
                                key={s.id}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
                                style={{
                                  color: 'rgb(var(--dashboard-text))',
                                  backgroundColor: 'rgb(var(--dashboard-surface))',
                                  borderColor: 'rgb(var(--dashboard-border))',
                                }}
                                title={s.percentage != null ? `${s.percentage}%` : undefined}
                              >
                                {s.name}
                                {s.percentage != null && (
                                  <span className="ml-1 opacity-80">({s.percentage}%)</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {errors.controlDefinitionId && (
            <p className="mt-1 text-sm text-red-600">{errors.controlDefinitionId}</p>
          )}
        </div>

        {definition && (
          <div
            className="rounded-lg p-4 border"
            style={{
              backgroundColor: 'rgb(var(--dashboard-accent-muted) / 0.3)',
              borderColor: 'rgb(var(--dashboard-accent) / 0.3)',
            }}
          >
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'rgb(var(--dashboard-text))' }}>
              Definition Details
            </h3>
            <div className="space-y-1 text-sm" style={{ color: 'rgb(var(--dashboard-text))' }}>
              <div>
                <span className="font-medium">Type:</span> {definition.controlType.replace('_', ' ')}
              </div>
              {definition.targetDensity !== undefined && (
                <div>
                  <span className="font-medium">Target Density:</span>{' '}
                  {definition.targetDensity.toLocaleString()} {definition.unitSymbol || ''}
                </div>
              )}
              {definition.strains && definition.strains.length > 0 && (
                <div className="mt-2">
                  <span className="font-medium block mb-1.5">Strain composition</span>
                  <div
                    className="flex h-2 rounded-full overflow-hidden mb-2"
                    style={{ backgroundColor: 'rgb(var(--dashboard-surface))' }}
                    role="img"
                    aria-label={definition.strains.map((s) => `${s.name} ${s.percentage ?? 0}%`).join(', ')}
                  >
                    {definition.strains.map((s, idx) => {
                      const pct = s.percentage ?? 0
                      return (
                        <div
                          key={s.id}
                          style={{
                            width: `${pct}%`,
                            backgroundColor: STRAIN_BAR_COLORS[idx % STRAIN_BAR_COLORS.length],
                          }}
                          title={`${s.name}: ${pct}%`}
                        />
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {definition.strains.map((s, idx) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
                        style={{
                          color: 'rgb(var(--dashboard-text))',
                          backgroundColor: 'rgb(var(--dashboard-card))',
                          borderColor: 'rgb(var(--dashboard-border))',
                        }}
                        title={s.percentage != null ? `${s.percentage}%` : undefined}
                      >
                        {s.name}
                        {s.percentage != null && (
                          <span className="ml-1 opacity-80">({s.percentage}%)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="batch-name" className="block text-sm font-medium text-gray-700 mb-2">
            Batch Name {!isAddMode && '*'}
          </label>
          <div className="relative">
            <input
              ref={nameInputRef}
              id="batch-name"
              type="text"
              value={localName}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={isAddMode}
              className={`block w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              } ${isAddMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              placeholder="e.g., Batch-2024-01-15"
            />
            {validating && (
              <div className="absolute right-3 top-2.5">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          {nameSuggestion && !errors.name && (
            <p className="mt-1 text-sm text-blue-600">
              Suggestion: <button
                type="button"
                onClick={() => handleNameChange(nameSuggestion)}
                className="underline hover:text-blue-800"
              >
                {nameSuggestion}
              </button>
            </p>
          )}
        </div>

        <div>
          <label htmlFor="production-date" className="block text-sm font-medium text-gray-700 mb-2">
            Production Date
          </label>
          <input
            id="production-date"
            type="date"
            value={batchInfo.productionDate}
            onChange={(e) => onChange({ ...batchInfo, productionDate: e.target.value })}
            disabled={isAddMode}
            className={`block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isAddMode ? 'bg-gray-100 cursor-not-allowed' : ''
            }`}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="blood-controls-btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={handleNext} className="blood-controls-btn-primary">
          Next: Add Specimen Types
        </button>
      </div>

      {showCreateModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm blood-controls-modal-overlay flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <div
              className="blood-controls-modal-panel dashboard-card p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Create new control definition"
            >
              <ControlDefinitionForm
                onCancel={() => setShowCreateModal(false)}
                onSuccess={handleCreateSuccess}
              />
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}

