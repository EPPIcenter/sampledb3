import { useState, useRef, useEffect } from 'react'
import { controlsApi, settingsApi, strainsApi, type ControlDefinition, type Strain, type Unit } from '../../lib/api'
import { useNavigate, useParams } from 'react-router-dom'
import { useModifierHotkey } from '../../hooks/useHotkey'

interface ControlDefinitionFormProps {
  controlDefinition?: ControlDefinition
  onSuccess?: (control?: ControlDefinition | ControlDefinition[]) => void
  onCancel?: () => void
}

interface StrainInput {
  strainId: number
  percentage: number
  strainName?: string
}

const concentrationUnits = (units: Unit[]) => units.filter((u) => u.category === 'concentration')

export default function ControlDefinitionForm({ controlDefinition: propControlDefinition, onSuccess, onCancel }: ControlDefinitionFormProps) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [strains, setStrains] = useState<Strain[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [controlDefinition, setControlDefinition] = useState<ControlDefinition | undefined>(propControlDefinition)
  const isEdit = !!(controlDefinition || id)

  // Shared: name (single-def create/edit), unit (all), and for edit mode single targetDensity
  const [formData, setFormData] = useState({
    name: propControlDefinition?.name || '',
    controlType: 'blood' as ControlDefinition['controlType'],
    targetDensity: propControlDefinition?.targetDensity?.toString() || '',
    targetDensityUnitId: propControlDefinition?.targetDensityUnitId?.toString() || '',
  })
  // Create mode only: list of density values (one row = one definition). Single density = one row.
  const [densityValues, setDensityValues] = useState<string[]>([''])

  const [strainInputs, setStrainInputs] = useState<StrainInput[]>([])
  const [showStrains, setShowStrains] = useState(false)
  const [autoGenerateName, setAutoGenerateName] = useState(!propControlDefinition)
  const [suggestedName, setSuggestedName] = useState<string>('')
  const [isGeneratingName, setIsGeneratingName] = useState(false)
  const [definitionNames, setDefinitionNames] = useState<string[]>([])
  const formDataRef = useRef(formData)
  const strainInputsRef = useRef(strainInputs)
  const densityValuesRef = useRef(densityValues)
  const generateNameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  formDataRef.current = formData
  strainInputsRef.current = strainInputs
  densityValuesRef.current = densityValues

  useEffect(() => {
    loadStrains()
    loadUnits()
    if (id && !propControlDefinition) {
      loadControlDefinition()
    }
  }, [id, propControlDefinition])

  useEffect(() => {
    return () => {
      if (generateNameTimeoutRef.current) {
        clearTimeout(generateNameTimeoutRef.current)
      }
    }
  }, [])

  // Initial strain for new definitions when strains have loaded (adjust during render)
  if (!id && !propControlDefinition && strains.length > 0 && strainInputs.length === 0) {
    setStrainInputs([
      { strainId: strains[0].id, percentage: 100, strainName: strains[0].name },
    ])
    setShowStrains(true)
  }

  // Sync form when controlDefinition is set from fetch (in loadControlDefinition)
  const loadControlDefinition = async () => {
    if (!id) return
    try {
      const res = await controlsApi.getDefinitionSummary(parseInt(id))
      const control = res.data.control
      setControlDefinition(control)
      const compositionStrains = res.data.composition?.strains || control.strains || []
      if (compositionStrains.length > 0) {
        setStrainInputs(
          compositionStrains.map((s: { id: number; name?: string; percentage?: number }) => ({
            strainId: s.id,
            percentage: s.percentage ?? 0,
            strainName: s.name,
          }))
        )
        setShowStrains(true)
      }
      const props = control.properties || {}
      const targetDensity = control.targetDensity ?? (props as { targetDensity?: number }).targetDensity
      const targetDensityUnitId = control.targetDensityUnitId ?? (props as { targetDensityUnitId?: number }).targetDensityUnitId
      setFormData({
        name: control.name || '',
        controlType: 'blood',
        targetDensity: targetDensity?.toString() ?? '',
        targetDensityUnitId: targetDensityUnitId?.toString() ?? '',
      })
    } catch (err) {
      console.error('Failed to load control definition:', err)
      setError('Failed to load control definition')
    }
  }

  const loadStrains = async () => {
    try {
      const res = await strainsApi.list()
      setStrains(res.data)
    } catch (err) {
      console.error('Failed to load strains:', err)
      setStrains([])
    }
  }

  const loadUnits = async () => {
    try {
      const res = await settingsApi.getUnits()
      setUnits(res.data)
    } catch (err) {
      console.error('Failed to load units:', err)
    }
  }

  // Derived: valid densities for create mode (from densityValues) or edit (single from formData)
  const targetDensitiesForNames = isEdit
    ? (formData.targetDensity.trim() ? (() => {
        const n = parseFloat(formData.targetDensity)
        return Number.isNaN(n) || n < 0 ? [] : [n]
      })() : [])
    : densityValues
        .map((s) => parseFloat(String(s).trim()))
        .filter((n) => !Number.isNaN(n) && n >= 0)
  const hasMultipleDensities = targetDensitiesForNames.length >= 2
  const canSuggestNames =
    !isEdit &&
    targetDensitiesForNames.length >= 1 &&
    strainInputs.length > 0 &&
    Math.abs(strainInputs.reduce((sum, s) => sum + s.percentage, 0) - 100) < 0.01

  useEffect(() => {
    if (!canSuggestNames) {
      setDefinitionNames([])
      return
    }
    let cancelled = false
    const unitId = formData.targetDensityUnitId ? parseInt(formData.targetDensityUnitId) : undefined
    const strainsPayload = strainInputs.map((s) => ({ strainId: s.strainId, percentage: s.percentage }))
    Promise.all(
      targetDensitiesForNames.map((d) =>
        controlsApi
          .suggestName({
            controlType: 'blood',
            targetDensity: d,
            targetDensityUnitId: unitId,
            strains: strainsPayload,
          })
          .then((r) => r.data.suggestedName)
      )
    ).then((names) => {
      if (!cancelled) setDefinitionNames(names)
    })
    return () => {
      cancelled = true
    }
  }, [
    canSuggestNames,
    formData.targetDensityUnitId,
    targetDensitiesForNames.join(','),
    strainInputs
      .map((s) => `${s.strainId}:${s.percentage}`)
      .sort()
      .join(','),
  ])

  const handleAddStrain = () => {
    const availableStrains = strains.filter((s) => !strainInputs.some((si) => si.strainId === s.id))
    if (availableStrains.length > 0) {
      setStrainInputs([
        ...strainInputs,
        { strainId: availableStrains[0].id, percentage: 0, strainName: availableStrains[0].name },
      ])
    }
  }

  const handleRemoveStrain = (index: number) => {
    setStrainInputs(strainInputs.filter((_, i) => i !== index))
  }

  const handleStrainChange = (index: number, field: 'strainId' | 'percentage', value: string | number) => {
    const newInputs = [...strainInputs]
    if (field === 'strainId') {
      const strain = strains.find((s) => s.id === Number(value))
      newInputs[index] = {
        ...newInputs[index],
        strainId: Number(value),
        strainName: strain?.name,
      }
    } else {
      newInputs[index] = { ...newInputs[index], percentage: Number(value) }
    }
    setStrainInputs(newInputs)
    if (autoGenerateName) scheduleGenerateName()
  }

  const scheduleGenerateName = () => {
    if (generateNameTimeoutRef.current) clearTimeout(generateNameTimeoutRef.current)
    generateNameTimeoutRef.current = setTimeout(() => {
      generateNameTimeoutRef.current = null
      generateNameFromRefs()
    }, 300)
  }

  const getFirstDensityForName = (): number | null => {
    if (isEdit) {
      const n = formData.targetDensity.trim() ? parseFloat(formData.targetDensity) : NaN
      return !Number.isNaN(n) && n >= 0 ? n : null
    }
    const first = densityValues[0]?.trim()
    if (!first) return null
    const n = parseFloat(first)
    return !Number.isNaN(n) && n >= 0 ? n : null
  }

  const generateNameFromRefs = async () => {
    const fd = formDataRef.current
    const inputs = strainInputsRef.current
    const density = isEdit ? fd.targetDensity.trim() : densityValuesRef.current[0].trim()
    if (!autoGenerateName || !density || inputs.length === 0) return
    const total = inputs.reduce((sum, s) => sum + s.percentage, 0)
    if (Math.abs(total - 100) >= 0.01) return
    const num = parseFloat(density)
    if (Number.isNaN(num) || num < 0) return
    setIsGeneratingName(true)
    try {
      const response = await controlsApi.suggestName({
        controlType: 'blood',
        targetDensity: num,
        targetDensityUnitId: fd.targetDensityUnitId ? parseInt(fd.targetDensityUnitId) : undefined,
        strains: inputs.map((s) => ({ strainId: s.strainId, percentage: s.percentage })),
      })
      setSuggestedName(response.data.suggestedName)
      setFormData((prev) => ({ ...prev, name: response.data.suggestedName }))
      if (response.data.exists && response.data.existingDefinition) {
        setError(`A control definition with this combination already exists: "${response.data.existingDefinition.name}"`)
      }
    } catch (err) {
      console.error('Failed to generate name:', err)
    } finally {
      setIsGeneratingName(false)
    }
  }

  const generateName = async (currentStrainInputs: StrainInput[] = strainInputs) => {
    const density = getFirstDensityForName()
    if (density == null || currentStrainInputs.length === 0) return
    const total = currentStrainInputs.reduce((sum, s) => sum + s.percentage, 0)
    if (Math.abs(total - 100) >= 0.01) return
    setIsGeneratingName(true)
    try {
      const response = await controlsApi.suggestName({
        controlType: 'blood',
        targetDensity: density,
        targetDensityUnitId: formData.targetDensityUnitId ? parseInt(formData.targetDensityUnitId) : undefined,  
        strains: currentStrainInputs.map((s) => ({ strainId: s.strainId, percentage: s.percentage })),
      })
      setSuggestedName(response.data.suggestedName)
      if (autoGenerateName) {
        setFormData((prev) => ({ ...prev, name: response.data.suggestedName }))
      }
      if (response.data.exists && response.data.existingDefinition) {
        setError(`A control definition with this combination already exists: "${response.data.existingDefinition.name}"`)
      }
    } catch (err) {
      console.error('Failed to generate name:', err)
    } finally {
      setIsGeneratingName(false)
    }
  }

  const totalPercentage = strainInputs.reduce((sum, s) => sum + s.percentage, 0)
  const isTotalValid = strainInputs.length === 0 || Math.abs(totalPercentage - 100) < 0.01

  const setDensityAt = (index: number, value: string) => {
    const next = [...densityValues]
    next[index] = value
    setDensityValues(next)
    if (autoGenerateName && index === 0 && value && strainInputs.length > 0) scheduleGenerateName()
  }

  const addDensity = () => setDensityValues([...densityValues, ''])
  const removeDensity = (index: number) => {
    if (densityValues.length <= 1) return
    setDensityValues(densityValues.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (showStrains && strainInputs.length > 0) {
      if (!isTotalValid) {
        setError(`Strain percentages must total exactly 100% (currently ${totalPercentage.toFixed(2)}%)`)
        setLoading(false)
        return
      }
      if (strainInputs.some((s) => s.percentage <= 0 || s.percentage > 100)) {
        setError('Each strain percentage must be between 0 and 100')
        setLoading(false)
        return
      }
    }

    try {
      if (formData.controlType === 'blood' && strainInputs.length === 0) {  
        setError('At least one strain is required')
        setLoading(false)
        return
      }

      const strainsPayload = strainInputs.map((s) => ({ strainId: s.strainId, percentage: s.percentage }))

      if (controlDefinition) {
        const updatePayload = {
          controlType: 'blood' as const,
          strains: strainsPayload,
          targetDensity: parseFloat(formData.targetDensity),
          targetDensityUnitId: formData.targetDensityUnitId ? parseInt(formData.targetDensityUnitId) : undefined,  
          ...(formData.name.trim() && { name: formData.name.trim() }),
        }
        const res = await controlsApi.update(controlDefinition.id, updatePayload as Parameters<typeof controlsApi.update>[1])
        if (onSuccess) onSuccess(res.data.control)
        else navigate('/blood-controls')
      } else {
        const densityStrings = densityValues.filter((s) => s != null && String(s).trim() !== '') // eslint-disable-line @typescript-eslint/no-unnecessary-condition
        const targetDensities = densityStrings.map((s) => parseFloat(String(s).trim()))
        const hasInvalid = targetDensities.some((n) => Number.isNaN(n) || n < 0)
        const unique = new Set(targetDensities)
        if (targetDensities.length === 0) {
          setError('At least one target density is required')
          setLoading(false)
          return
        }
        if (hasInvalid) {
          setError('All densities must be valid positive numbers')
          setLoading(false)
          return
        }
        if (unique.size !== targetDensities.length) {
          setError('Duplicate densities are not allowed')
          setLoading(false)
          return
        }
        if (definitionNames.length !== targetDensities.length) {
          setError('Definition names are still loading. Please wait a moment and try again.')
          setLoading(false)
          return
        }
        const targetDensityUnitId = formData.targetDensityUnitId ? parseInt(formData.targetDensityUnitId) : undefined
        if (targetDensities.length === 1) {
          const createPayload: Parameters<typeof controlsApi.create>[0] = {
            controlType: 'blood',
            name: (definitionNames[0] ?? '').trim() || 'Control',
            targetDensity: targetDensities[0],
            targetDensityUnitId,
            strains: strainsPayload,
          }
          const res = await controlsApi.create(createPayload)
          if (onSuccess) onSuccess(res.data.control)
          else navigate('/blood-controls')
        } else {
          const res = await controlsApi.createDefinitionsBulk({
            strains: strainsPayload,
            targetDensities,
            targetDensityUnitId,
            names: definitionNames,
          })
          if (onSuccess) onSuccess(res.data.controls)
          else navigate('/blood-controls')
        }
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err && err.response && typeof (err.response as { data?: { error?: string } }).data?.error === 'string'
        ? (err.response as { data: { error: string } }).data.error
        : 'Failed to save control definition'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useModifierHotkey(
    'enter',
    (e) => {
      if (!loading && formRef.current) {
        e.preventDefault()
        formRef.current.requestSubmit()
      }
    },
    { preventDefault: true, enableOnFormTags: true }
  )

  const availableStrainsForIndex = (index: number) =>
    strains.filter((s) => !strainInputs.some((si, i) => i !== index && si.strainId === s.id))

  const unitOptions = concentrationUnits(units)

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-app-text">
          {controlDefinition ? 'Edit Blood Control Definition' : 'New Blood Control Definition'}
        </h1>
        <p className="text-app-text-muted mt-1">
          {controlDefinition
            ? 'Update blood control definition details and strain composition'
            : 'Create a new blood control definition with density and strain composition'}
        </p>
      </div>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-app-trend-down/10 border border-app-trend-down text-app-trend-down px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Section 1: Strain composition (first) */}
        <div className="space-y-3">
          <h2 className="blood-controls-section-title text-lg font-semibold text-app-text">Strain composition</h2>
          <p className="text-sm text-app-text-muted">Parasite strains and percentages; total must equal 100%.</p>
          <div className="border border-app-border rounded-lg p-4 bg-app-surface space-y-4">
            {strainInputs.length === 0 && (
              <p className="text-sm text-app-text-muted italic">No strains added yet. Click &quot;Add strain&quot; to begin.</p>
            )}
            {strainInputs.map((strainInput, index) => {
              const availableStrains = availableStrainsForIndex(index)
              return (
                <div key={index} className="flex gap-2 items-center bg-app-card p-3 rounded border border-app-border">
                  <select
                    value={strainInput.strainId}
                    onChange={(e) => handleStrainChange(index, 'strainId', e.target.value)}
                    className="form-input flex-1"
                    required
                    aria-label="Strain"
                  >
                    <option value="">Select strain</option>
                    {availableStrains.map((s) => (
                      <option key={s.id} value={s.id.toString()}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={strainInput.percentage}
                    onChange={(e) => handleStrainChange(index, 'percentage', e.target.value)}
                    className="form-input w-24"
                    placeholder="%"
                    required
                    aria-label="Percentage"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveStrain(index)}
                    className="text-app-trend-down hover:text-app-trend-down/80 font-bold px-3 py-2"
                    title="Remove strain"
                    aria-label="Remove strain"
                  >
                    ×
                  </button>
                </div>
              )
            })}
            {strainInputs.length > 0 && (
              <div
                className={`text-sm font-medium ${isTotalValid ? 'text-app-trend-up' : 'text-app-trend-down'} bg-app-card p-2 rounded border border-app-border`}
              >
                Total: {totalPercentage.toFixed(2)}% {isTotalValid ? '✓' : `(need ${(100 - totalPercentage).toFixed(2)}% more)`}
              </div>
            )}
            <button
              type="button"
              onClick={handleAddStrain}
              className="text-sm text-app-accent hover:text-app-accent-hover font-medium"
              disabled={strains.filter((s) => !strainInputs.some((si) => si.strainId === s.id)).length === 0}
              aria-label="Add strain"
            >
              + Add strain
            </button>
          </div>
        </div>

        {/* Section 2: Target density / densities */}
        <div className="space-y-3">
          <h2 className="blood-controls-section-title text-lg font-semibold text-app-text">
            {isEdit ? 'Target density' : 'Target densities'}
          </h2>
          {isEdit ? (
            <p className="text-sm text-app-text-muted">Concentration for this definition.</p>
          ) : (
            <p className="text-sm text-app-text-muted">Same composition, one or more target concentrations.</p>
          )}
          {isEdit ? (
            <div className="flex gap-2">
              <label htmlFor="target-density" className="sr-only">
                Target density
              </label>
              <input
                id="target-density"
                type="number"
                step="any"
                value={formData.targetDensity}
                onChange={(e) => setFormData({ ...formData, targetDensity: e.target.value })}
                className="form-input flex-1"
                placeholder="e.g. 10000"
                required
              />
              <select
                value={formData.targetDensityUnitId}
                onChange={(e) => setFormData({ ...formData, targetDensityUnitId: e.target.value })}
                className="form-input w-48"
                aria-label="Concentration unit"
              >
                <option value="">Select unit</option>
                {unitOptions.map((u) => (
                  <option key={u.id} value={u.id.toString()}>
                    {u.symbol} ({u.name})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <label htmlFor="density-unit" className="text-sm font-medium text-app-text">
                  Concentration unit
                </label>
                <select
                  id="density-unit"
                  value={formData.targetDensityUnitId}
                  onChange={(e) => setFormData({ ...formData, targetDensityUnitId: e.target.value })}
                  className="form-input w-48"
                  aria-label="Concentration unit"
                >
                  <option value="">Select unit</option>
                  {unitOptions.map((u) => (
                    <option key={u.id} value={u.id.toString()}>
                      {u.symbol} ({u.name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,10rem)_1fr_auto] gap-2 items-center text-sm font-medium text-app-text-muted border-b border-app-border pb-1">
                  <span>Density</span>
                  <span>Definition name</span>
                  <span className="w-8" aria-hidden="true" />
                </div>
                {densityValues.map((val, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] gap-2 items-center">
                    <label htmlFor={index === 0 ? 'target-density' : `density-${index}`} className="sr-only">
                      {index === 0 ? 'Target density' : `Density ${index + 1}`}
                    </label>
                    <input
                      id={index === 0 ? 'target-density' : `density-${index}`}
                      type="number"
                      step="any"
                      min="0"
                      value={val}
                      onChange={(e) => setDensityAt(index, e.target.value)}
                      className="form-input w-full max-w-[10rem] min-w-0"
                      placeholder="e.g. 1000"
                      aria-label={index === 0 ? 'Target density' : `Density ${index + 1}`}
                    />
                    <label htmlFor={`definition-name-${index}`} className="sr-only">
                      Name (density {targetDensitiesForNames[index] != null ? (targetDensitiesForNames[index] >= 1000 ? `${targetDensitiesForNames[index] / 1000}K` : targetDensitiesForNames[index]) : index + 1}) {/* eslint-disable-line @typescript-eslint/no-unnecessary-condition */}
                    </label>
                    <input
                      id={`definition-name-${index}`}
                      type="text"
                      value={definitionNames[index] ?? ''}
                      onChange={(e) => {
                        const next = [...definitionNames]
                        next[index] = e.target.value
                        setDefinitionNames(next)
                      }}
                      className="form-input min-w-0 w-full"
                      placeholder="Name for this definition"
                      aria-label={`Name (density ${targetDensitiesForNames[index] != null ? (targetDensitiesForNames[index] >= 1000 ? `${targetDensitiesForNames[index] / 1000}K` : targetDensitiesForNames[index]) : index + 1})`} // eslint-disable-line @typescript-eslint/no-unnecessary-condition
                    />
                    <button
                      type="button"
                      onClick={() => removeDensity(index)}
                      disabled={densityValues.length <= 1}
                      className="text-app-trend-down hover:text-app-trend-down/80 font-bold px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Remove density"
                      aria-label={`Remove density ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDensity}
                  className="text-sm text-app-accent hover:text-app-accent-hover font-medium"
                  aria-label="Add density"
                >
                  + Add density
                </button>
              </div>
            </>
          )}
        </div>

        {/* Definition name: only for edit mode */}
        {isEdit && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="control-name" className="block text-sm font-medium text-app-text">
                Definition name {!autoGenerateName && '*'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-generate-name"
                  checked={autoGenerateName}
                  onChange={(e) => {
                    setAutoGenerateName(e.target.checked)
                    if (e.target.checked) {
                      const d = getFirstDensityForName()
                      if (d != null && strainInputs.length > 0) generateName()
                    } else {
                      setFormData((prev) => ({ ...prev, name: '' }))
                    }
                  }}
                  className="rounded"
                  aria-label="Auto-generate name"
                />
                <label htmlFor="auto-generate-name" className="text-sm text-app-text-muted cursor-pointer">
                  Auto-generate name
                </label>
              </div>
            </div>
            <div className="relative">
              <input
                id="control-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required={!autoGenerateName}
                disabled={autoGenerateName && isGeneratingName}
                className="form-input w-full"
                placeholder={autoGenerateName ? (isGeneratingName ? 'Generating...' : 'Name will be auto-generated') : 'Enter name'}
                aria-label="Definition name"
              />
              {autoGenerateName && suggestedName && !isGeneratingName && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-app-text-muted">Suggested: {suggestedName}</div>
              )}
            </div>
            {autoGenerateName && getFirstDensityForName() != null && strainInputs.length > 0 && (
              <p className="text-xs text-app-text-muted">Name will be generated from density and strain composition.</p>
            )}
          </div>
        )}

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => (onCancel ? onCancel() : navigate(-1))}
            className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              loading ||
              (formData.controlType === 'blood' && showStrains && strainInputs.length > 0 && !isTotalValid)
            }
            className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50"
          >
            {loading ? 'Saving...' : controlDefinition ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
