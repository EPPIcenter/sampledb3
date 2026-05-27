import { useState, useEffect } from 'react'
import { settingsApi } from '../lib/api/settings';
import type { ContainerDefaults } from '../lib/api/settings';
import type { Unit } from '../lib/api/types';
import InfoTooltip from './InfoTooltip'

interface ContainerTypeUnitsManagerProps {
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

const CONTAINER_TYPES = [
  { value: 'paper', label: 'Paper (DBS Sheet)' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'static_well', label: 'Static Well' },
] as const

type ContainerType = typeof CONTAINER_TYPES[number]['value']

export default function ContainerTypeUnitsManager({
  onSave,
  onError,
  onSuccess,
}: ContainerTypeUnitsManagerProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Map of container type -> array of allowed unit IDs
  const [allowedUnits, setAllowedUnits] = useState<Record<ContainerType, number[]>>({
    paper: [],
    cryovial_tube: [],
    micronix_tube: [],
    static_well: [],
  })
  
  // Map of container type -> default unit symbol
  const [defaultUnits, setDefaultUnits] = useState<Record<ContainerType, string | null>>({
    paper: null,
    cryovial_tube: null,
    micronix_tube: null,
    static_well: null,
  })
  
  // Container defaults data (for quantities)
  const [containerDefaults, setContainerDefaults] = useState<ContainerDefaults | null>(null)
  
  // All available units
  const [allUnits, setAllUnits] = useState<Unit[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load all units
      const unitsResponse = await settingsApi.getUnits()
      setAllUnits(unitsResponse.data)

      // Load container defaults to get default unit symbols
      try {
        const defaultsResponse = await settingsApi.get('container_defaults')
        const defaults = defaultsResponse.data.value as ContainerDefaults | null
        setContainerDefaults(defaults)
        
        if (defaults) {
          const defaultUnitSymbols: Record<ContainerType, string | null> = {
            paper: defaults.paper.defaultUnitSymbol || null,
            cryovial_tube: defaults.cryovial_tube.defaultUnitSymbol || null,
            micronix_tube: defaults.micronix_tube.defaultUnitSymbol || null,
            static_well: defaults.static_well.defaultUnitSymbol || null,
          }
          setDefaultUnits(defaultUnitSymbols)
        }
      } catch (err) {
        console.error('Failed to load container defaults:', err)
      }

      // Load allowed units for each container type
      const allowed: Record<ContainerType, number[]> = {
        paper: [],
        cryovial_tube: [],
        micronix_tube: [],
        static_well: [],
      }

      await Promise.all(
        CONTAINER_TYPES.map(async (ct) => {
          try {
            const response = await settingsApi.getContainerTypeUnits(ct.value)
            allowed[ct.value] = response.data.units.map((u: Unit) => u.id)
          } catch (err) {
            console.error(`Failed to load units for ${ct.value}:`, err)
          }
        })
      )

      setAllowedUnits(allowed)
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to load container type units'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleUnit = async (containerType: ContainerType, unitId: number) => {
    const currentAllowed = allowedUnits[containerType]
    const isAllowed = currentAllowed.includes(unitId)
    const unit = allUnits.find(u => u.id === unitId)
    const currentDefault = defaultUnits[containerType]

    try {
      setError(null)
      if (isAllowed) {
        // Remove unit - also remove as default if it was the default
        await settingsApi.removeContainerTypeUnit(containerType, unitId)
        setAllowedUnits((prev) => ({
          ...prev,
          [containerType]: prev[containerType].filter((id) => id !== unitId),
        }))
        
        // If this was the default unit, clear it
        if (unit && currentDefault === unit.symbol) {
          await handleSetDefaultUnit(containerType, null)
        }
      } else {
        // Add unit
        await settingsApi.addContainerTypeUnit(containerType, unitId)
        setAllowedUnits((prev) => ({
          ...prev,
          [containerType]: [...prev[containerType], unitId],
        }))
      }
      setSuccess('Unit relationship updated')
      setTimeout(() => setSuccess(null), 3000)
      onSuccess?.()
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to update unit relationship'
      setError(errorMsg)
      onError?.(errorMsg)
      // Reload to get correct state
      await loadData()
    }
  }

  const handleSetDefaultUnit = async (containerType: ContainerType, unitSymbol: string | null) => {
    try {
      setError(null)
      setSaving(true)

      // Load current container defaults
      const defaultsResponse = await settingsApi.get('container_defaults')
      let defaults = defaultsResponse.data.value as ContainerDefaults | null

      // Initialize defaults if they don't exist
      if (!defaults) {
        defaults = {
          micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: '' },
          cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: '' },
          paper: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: '' },
          static_well: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: '' },
        }
      }

      // Update the default unit symbol for this container type
      defaults[containerType] = {
        ...defaults[containerType],
        defaultUnitSymbol: unitSymbol || '',
      }

      // Save updated defaults
      await settingsApi.update('container_defaults', defaults)
      
      setDefaultUnits((prev) => ({
        ...prev,
        [containerType]: unitSymbol,
      }))
      setContainerDefaults(defaults)
      
      setSuccess('Default unit updated')
      setTimeout(() => setSuccess(null), 3000)
      onSuccess?.()
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to update default unit'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-app-text-muted">Loading container type unit relationships...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-app-accent-muted border border-app-accent/50 rounded-lg p-4">
        <p className="text-sm text-app-accent-hover">
          <strong>Container Type / Unit Configuration:</strong> Configure which units are allowed for each container type and set the default unit.
          Only units that are allowed for a container type can be used when creating or editing containers of that type.
          The default unit is automatically selected when creating new containers.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-app-trend-down/10 border border-app-trend-down p-3">
          <p className="text-sm font-medium text-app-trend-down">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-app-trend-up/10 border border-app-trend-up/30 p-3">
          <p className="text-sm font-medium text-app-trend-up">{success}</p>
        </div>
      )}

      <div className="space-y-6">
        {CONTAINER_TYPES.map((containerType) => {
          const allowedUnitIds = allowedUnits[containerType.value]
          
          return (
            <div key={containerType.value} className="border border-app-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-app-text">{containerType.label}</h3>
                <span className="text-sm text-app-text-muted">
                  {allowedUnitIds.length} unit{allowedUnitIds.length !== 1 ? 's' : ''} allowed
                </span>
              </div>

              {allUnits.length === 0 ? (
                <div className="text-sm text-app-text-muted py-4">
                  No units available. Please create units in Reference Data first.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allUnits.map((unit) => {
                    const isAllowed = allowedUnitIds.includes(unit.id)
                    const isDefault = defaultUnits[containerType.value] === unit.symbol
                    
                    return (
                      <div
                        key={unit.id}
                        className={`p-3 rounded-md border-2 transition-colors ${
                          isAllowed
                            ? isDefault
                              ? 'bg-app-trend-up/10 border-green-400'
                              : 'bg-app-accent-muted border-app-accent/50'
                            : 'bg-app-card border-app-border hover:bg-app-surface'
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          <input
                            type="checkbox"
                            checked={isAllowed}
                            onChange={() => handleToggleUnit(containerType.value, unit.id)}
                            disabled={saving}
                            className="mt-1 rounded border-app-border text-app-accent focus:ring-app-accent disabled:opacity-50"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-app-text">{unit.symbol}</div>
                              {isDefault && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-600 text-white">
                                  Default
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-app-text-muted truncate">{unit.name}</div>
                            {unit.category && (
                              <div className="text-xs text-app-text-muted mt-0.5">{unit.category}</div>
                            )}
                            {isAllowed && (
                              <button
                                type="button"
                                onClick={() => handleSetDefaultUnit(containerType.value, unit.symbol)}
                                disabled={saving || isDefault}
                                className={`mt-2 text-xs px-2 py-1 rounded ${
                                  isDefault
                                    ? 'bg-green-200 text-app-trend-up cursor-not-allowed'
                                    : 'bg-app-surface text-app-text hover:bg-app-surface'
                                } disabled:opacity-50`}
                              >
                                {isDefault ? 'Current Default' : 'Set as Default'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {allowedUnitIds.length === 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    ⚠️ No units are currently allowed for {containerType.label}. 
                    You must allow at least one unit before containers of this type can be created.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
