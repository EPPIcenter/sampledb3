import { useState, useEffect, useRef } from 'react'
import { settingsApi, type ContainerDefaults, type Unit } from '../lib/api'
import InfoTooltip from './InfoTooltip'

interface ContainerDefaultsFormProps {
  data: ContainerDefaults | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

export default function ContainerDefaultsForm({
  data,
  onSave,
  onError,
  onSuccess,
}: ContainerDefaultsFormProps) {
  const [formData, setFormData] = useState<ContainerDefaults | null>(null)
  const [savedFormData, setSavedFormData] = useState<ContainerDefaults | null>(null)
  const [saving, setSaving] = useState(false)
  const [units, setUnits] = useState<Unit[]>([])
  const [allowedUnitsByType, setAllowedUnitsByType] = useState<Record<string, Unit[]>>({})
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [fallbackWarnings, setFallbackWarnings] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Helper to get safe unit symbol with validation and warnings
  const getSafeUnitSymbol = (
    preferred: string,
    containerType: string,
    availableUnits: Unit[],
    unitSymbols: Set<string>,
    warnings: string[]
  ): string => {
    if (unitSymbols.has(preferred)) {
      return preferred
    }
    
    // Preferred unit doesn't exist - try common fallback
    const commonFallback = preferred === 'items' ? 'items' : preferred === 'spots' ? 'spots' : null
    if (commonFallback && unitSymbols.has(commonFallback)) {
      warnings.push(`⚠️ ${containerType}: Preferred unit '${preferred}' not found, using '${commonFallback}' instead.`)
      return commonFallback
    }
    
    // Last resort: use first available unit
    if (availableUnits.length > 0) {
      const fallbackSymbol = availableUnits[0].symbol
      warnings.push(`⚠️ ${containerType}: Preferred unit '${preferred}' not found, using first available unit '${fallbackSymbol}' instead. Please configure the correct unit.`)
      return fallbackSymbol
    }
    
    // This should never happen if we validate units.length > 0 before calling
    throw new Error(`No units available for ${containerType}. Please create units first.`)
  }

  // Helper to get safe defaults when no data exists
  const getDefaultFormData = (availableUnits: Unit[]): ContainerDefaults => {
    if (availableUnits.length === 0) {
      throw new Error('No units available. Please create units before configuring container defaults.')
    }
    const unitSymbols = new Set(availableUnits.map(u => u.symbol))
    const warnings: string[] = []
    
    const getSafe = (preferred: string, containerType: string) => 
      getSafeUnitSymbol(preferred, containerType, availableUnits, unitSymbols, warnings)

    const defaults = {
      micronix_tube: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafe('items', 'Micronix Tube'),
      },
      cryovial_tube: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafe('items', 'Cryovial Tube'),
      },
      paper: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafe('spots', 'Paper'),
      },
      static_well: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafe('spots', 'Static Well'),
      },
    }
    
    // Set warnings if any fallbacks were used
    if (warnings.length > 0) {
      setFallbackWarnings(warnings)
    }
    
    return defaults
  }

  useEffect(() => {
    loadUnits()
  }, [])

  const prevInitRef = useRef<{ dataKey: string; unitsKey: string }>({ dataKey: '', unitsKey: '' })

  // Initialize form when units and data are ready (during render to avoid Effect chain)
  if (!loadingUnits && units.length > 0) {
    const dataKey = data === null ? 'null' : JSON.stringify(data)
    const unitsKey = units.map((u) => u.symbol).join(',')
    if (dataKey !== prevInitRef.current.dataKey || unitsKey !== prevInitRef.current.unitsKey) {
      prevInitRef.current = { dataKey, unitsKey }
      if (data) {
        const unitSymbols = new Set(units.map((u) => u.symbol))
        const warnings: string[] = []
        const getSafe = (preferred: string, containerType: string, savedSymbol?: string) => {
          if (savedSymbol && unitSymbols.has(savedSymbol)) return savedSymbol
          return getSafeUnitSymbol(preferred, containerType, units, unitSymbols, warnings)
        }
        const safeData: ContainerDefaults = {
          micronix_tube: {
            totalQuantity: data.micronix_tube?.totalQuantity ?? 1.0,
            remainingQuantity: data.micronix_tube?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: getSafe('items', 'Micronix Tube', data.micronix_tube?.defaultUnitSymbol),
          },
          cryovial_tube: {
            totalQuantity: data.cryovial_tube?.totalQuantity ?? 1.0,
            remainingQuantity: data.cryovial_tube?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: getSafe('items', 'Cryovial Tube', data.cryovial_tube?.defaultUnitSymbol),
          },
          paper: {
            totalQuantity: data.paper?.totalQuantity ?? 1.0,
            remainingQuantity: data.paper?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: getSafe('spots', 'Paper', data.paper?.defaultUnitSymbol),
          },
          static_well: {
            totalQuantity: data.static_well?.totalQuantity ?? 1.0,
            remainingQuantity: data.static_well?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: getSafe('spots', 'Static Well', data.static_well?.defaultUnitSymbol),
          },
        }
        setFallbackWarnings(warnings.length > 0 ? warnings : [])
        setFormData(safeData)
        setSavedFormData(safeData)
      } else {
        const defaultData = getDefaultFormData(units)
        setFormData(defaultData)
        setSavedFormData(defaultData)
      }
    }
  }

  const loadUnits = async () => {
    try {
      setUnitsError(null)
      // Load all units
      const res = await settingsApi.getUnits()
      setUnits(res.data)

      // Load allowed units for each container type
      const allowed: Record<string, Unit[]> = {}
      const containerTypes: Array<keyof ContainerDefaults> = ['micronix_tube', 'cryovial_tube', 'paper', 'static_well']
      
      await Promise.all(
        containerTypes.map(async (containerType) => {
          try {
            const response = await settingsApi.getContainerTypeUnits(containerType)
            allowed[containerType] = response.data.units || []
          } catch (err) {
            console.error(`Failed to load allowed units for ${containerType}:`, err)
            allowed[containerType] = []
          }
        })
      )

      setAllowedUnitsByType(allowed)
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to load units'
      setUnitsError(errorMessage)
      setUnits([])
      console.error('Failed to load units:', err)
    } finally {
      setLoadingUnits(false)
    }
  }

  const handleChange = (
    containerType: keyof ContainerDefaults,
    field: 'totalQuantity' | 'remainingQuantity',
    value: string
  ) => {
    if (!formData) return
    
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue > 0) {
      setFormData({
        ...formData,
        [containerType]: {
          ...formData[containerType],
          [field]: numValue,
        },
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData) return
    
    // Note: Default unit validation is no longer needed here since it's managed in Container Type Units
    // We still preserve the defaultUnitSymbol in the data structure for backwards compatibility
    
    setSaving(true)
    try {
      await settingsApi.update('container_defaults', formData)
      setSavedFormData(formData) // Update saved state
      onSuccess?.()
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to save container defaults'
      const errorDetails = err.response?.data?.details
      const fullMessage = errorDetails 
        ? `${errorMessage}: ${Array.isArray(errorDetails) ? errorDetails.map((d: any) => d.message || d).join(', ') : errorDetails}`
        : errorMessage
      onError?.(fullMessage)
    } finally {
      setSaving(false)
    }
  }

  const containerTypes: Array<{ key: keyof ContainerDefaults; label: string }> = [
    { key: 'micronix_tube', label: 'Micronix Tube' },
    { key: 'cryovial_tube', label: 'Cryovial Tube' },
    { key: 'paper', label: 'Paper' },
    { key: 'static_well', label: 'Static Well' },
  ]

  // Check if there are unsaved changes
  const hasUnsavedChanges = formData !== null && savedFormData !== null && 
    JSON.stringify(formData) !== JSON.stringify(savedFormData)

  // Show loading state until both data (or null) and units are ready
  const isLoading = loadingUnits || formData === null

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="mb-2">
          <p className="text-xs text-gray-600">
            Default quantity values and unit symbols pre-filled when creating new containers. <InfoTooltip text="These values are pre-filled but can be changed during container creation." />
          </p>
        </div>
        <div className="text-center py-8 text-sm text-gray-500">
          Loading settings...
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="mb-2">
        <p className="text-xs text-gray-600">
          Default quantity values pre-filled when creating new containers. Default units are configured in <a href="/settings?category=application&section=container-type-units" className="text-blue-600 hover:text-blue-800 underline">Container Type Units</a> settings. <InfoTooltip text="These values are pre-filled but can be changed during container creation." />
        </p>
      </div>

      {unitsError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-red-800">
              {unitsError}. Please refresh the page or contact support if the problem persists.
            </p>
          </div>
        </div>
      )}

      {fallbackWarnings.length > 0 && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 mb-1">
                Unit configuration warnings:
              </p>
              <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                {fallbackWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
              <p className="text-xs text-yellow-600 mt-2">
                Please review and update the default units to match your configuration.
              </p>
            </div>
          </div>
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm font-medium text-yellow-800">
              You have unsaved changes. Don't forget to click "Save Changes" to apply your configuration.
            </p>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Container Type</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Total Quantity</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Remaining Quantity</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                Default Unit
                <InfoTooltip text="Default unit is configured in Container Type Units settings" />
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {containerTypes.map((container) => (
              <tr key={container.key} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-900 align-middle">{container.label}</td>
                <td className="px-3 py-2 text-right align-middle">
                  <div className="flex justify-end">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={formData[container.key].totalQuantity}
                      onChange={(e) =>
                        handleChange(container.key, 'totalQuantity', e.target.value)
                      }
                      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-right"
                      required
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right align-middle">
                  <div className="flex justify-end">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={formData[container.key].remainingQuantity}
                      onChange={(e) =>
                        handleChange(container.key, 'remainingQuantity', e.target.value)
                      }
                      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-right"
                      required
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-left align-middle">
                  <div className="flex items-center gap-2">
                    {formData[container.key].defaultUnitSymbol ? (
                      <>
                        <span className="text-xs font-medium text-gray-900">
                          {formData[container.key].defaultUnitSymbol}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({units.find(u => u.symbol === formData[container.key].defaultUnitSymbol)?.name || 'Unknown'})
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Not set</span>
                    )}
                    <a
                      href="/settings?category=application&section=container-type-units"
                      className="text-xs text-blue-600 hover:text-blue-800 underline ml-2"
                    >
                      Configure
                    </a>
                  </div>
                  {validationErrors[container.key] && (
                    <p className="text-xs text-red-600 mt-1">{validationErrors[container.key]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving || !hasUnsavedChanges || unitsError !== null}
          className={`px-3 py-1.5 text-xs rounded transition-all ${
            hasUnsavedChanges && !unitsError
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </span>
          ) : hasUnsavedChanges ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Changes
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
        </button>
      </div>
    </form>
  )
}

