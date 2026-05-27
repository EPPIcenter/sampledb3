import { useState, useEffect } from 'react'
import type { SpecimenType } from '../../lib/api/types'
import type { SpecimenTypeConfig } from '../../pages/ControlBatchWizard'
import {
  useSpecimenTypeContainerTypesForId,
  useSpecimenTypesByContainerType,
} from '../../hooks/useReferenceData'
import { SectionMessage, getQueryErrorMessage } from '../../ui'

interface SpecimenTypesStepProps {
  specimenTypes: SpecimenTypeConfig[]
  onChange: (types: SpecimenTypeConfig[]) => void
  availableSpecimenTypes: SpecimenType[]
  onNext: () => void
  onBack: () => void
  onCancel: () => void
  onSwitchToCSV: () => void
}

export default function SpecimenTypesStep({
  specimenTypes,
  onChange,
  availableSpecimenTypes,
  onNext,
  onBack,
  onCancel,
  onSwitchToCSV,
}: SpecimenTypesStepProps) {
  const [newSpecimenType, setNewSpecimenType] = useState<Partial<SpecimenTypeConfig>>({
    specimenTypeId: 0,
    specimenTypeName: '',
    containerType: undefined,
  })
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [allowedContainerTypes, setAllowedContainerTypes] = useState<string[]>([])
  const [allowedSpecimenTypes, setAllowedSpecimenTypes] = useState<SpecimenType[]>([])

  const specimenTypeId = newSpecimenType.specimenTypeId ?? 0
  const containerTypesQuery = useSpecimenTypeContainerTypesForId(specimenTypeId)
  const specimenTypesByContainerQuery = useSpecimenTypesByContainerType(
    newSpecimenType.containerType,
  )

  // Get already added combinations of specimen type ID and container type
  const addedCombinations = new Set(
    specimenTypes.map(st => `${st.specimenTypeId}-${st.containerType}`)
  )
  
  useEffect(() => {
    if (specimenTypeId <= 0) {
      setAllowedContainerTypes([])
      return
    }
    if (containerTypesQuery.isSuccess && containerTypesQuery.data) {
      const containerTypes = containerTypesQuery.data.containerTypes
      setAllowedContainerTypes(containerTypes)
      if (newSpecimenType.containerType && containerTypes.length > 0) {
        if (!containerTypes.includes(newSpecimenType.containerType)) {
          setNewSpecimenType((prev) => ({
            ...prev,
            containerType: containerTypes[0] as 'paper' | 'cryovial_tube' | 'micronix_tube',
          }))
        }
      }
    } else if (containerTypesQuery.isError) {
      setAllowedContainerTypes([])
    }
  }, [specimenTypeId, containerTypesQuery.data, containerTypesQuery.isSuccess, containerTypesQuery.isError, newSpecimenType.containerType])

  useEffect(() => {
    if (!newSpecimenType.containerType) {
      setAllowedSpecimenTypes([])
      return
    }
    if (specimenTypesByContainerQuery.isSuccess && specimenTypesByContainerQuery.data) {
      const types = specimenTypesByContainerQuery.data
      setAllowedSpecimenTypes(types)
      if (newSpecimenType.specimenTypeId && types.length > 0) {
        const isAllowed = types.some((st) => st.id === newSpecimenType.specimenTypeId)
        if (!isAllowed) {
          setNewSpecimenType((prev) => ({
            ...prev,
            specimenTypeId: 0,
            specimenTypeName: '',
          }))
        }
      }
    } else if (specimenTypesByContainerQuery.isError) {
      setAllowedSpecimenTypes([])
    }
  }, [
    newSpecimenType.containerType,
    newSpecimenType.specimenTypeId,
    specimenTypesByContainerQuery.data,
    specimenTypesByContainerQuery.isSuccess,
    specimenTypesByContainerQuery.isError,
  ])

  const loadingContainerTypes = containerTypesQuery.isFetching && specimenTypeId > 0
  const loadingSpecimenTypes =
    specimenTypesByContainerQuery.isFetching && !!newSpecimenType.containerType
  
  // Filter available types based on constraints
  const availableTypes = allowedSpecimenTypes.length > 0 
    ? availableSpecimenTypes.filter(type => allowedSpecimenTypes.some(st => st.id === type.id))
    : availableSpecimenTypes
  
  // Define all possible container types
  const allContainerTypes: Array<{ value: 'paper' | 'cryovial_tube' | 'micronix_tube'; label: string }> = [
    { value: 'paper', label: 'DBS Sheet (Paper)' },
    { value: 'cryovial_tube', label: 'Cryovial' },
    { value: 'micronix_tube', label: 'Micronix Tube' },
  ]
  
  // Filter container types based on constraints
  const availableContainerTypes = allowedContainerTypes.length > 0
    ? allContainerTypes.filter(ct => allowedContainerTypes.includes(ct.value))
    : allContainerTypes

  const addSpecimenType = () => {
    if (!newSpecimenType.specimenTypeId || !newSpecimenType.specimenTypeName || !newSpecimenType.containerType) {
      return
    }

    const containerType = newSpecimenType.containerType
    const combinationKey = `${newSpecimenType.specimenTypeId}-${containerType}`

    // Check for duplicate combination (specimen type + container type)
    if (addedCombinations.has(combinationKey)) {
      const containerTypeName = containerType === 'paper' ? 'DBS Sheet' : 
                                containerType === 'cryovial_tube' ? 'Cryovial' : 
                                'Micronix'
      setDuplicateError(
        `Specimen type "${newSpecimenType.specimenTypeName}" with container type "${containerTypeName}" has already been added`
      )
      return
    }

    setDuplicateError(null)

    const config: SpecimenTypeConfig = {
      id: `st-${Date.now()}-${Math.random()}`,
      specimenTypeId: newSpecimenType.specimenTypeId!,
      specimenTypeName: newSpecimenType.specimenTypeName!,
      containerType: newSpecimenType.containerType!,
      containers: [],
    }

    onChange([...specimenTypes, config])
    setNewSpecimenType({
      specimenTypeId: 0,
      specimenTypeName: '',
      containerType: undefined,
    })
  }

  const removeSpecimenType = (id: string) => {
    onChange(specimenTypes.filter(st => st.id !== id))
  }

  const handleSpecimenTypeSelect = (specimenTypeId: number) => {
    const type = availableSpecimenTypes.find(t => t.id === specimenTypeId)
    const containerType = newSpecimenType.containerType
    const combinationKey = containerType ? `${specimenTypeId}-${containerType}` : null
    
    // Check if this exact combination already exists
    if (specimenTypeId > 0 && containerType && combinationKey && addedCombinations.has(combinationKey)) {
      const containerTypeName = containerType === 'paper' ? 'DBS Sheet' : 
                                containerType === 'cryovial_tube' ? 'Cryovial' : 
                                'Micronix'
      setDuplicateError(
        `Specimen type "${type?.name || ''}" with container type "${containerTypeName}" has already been added`
      )
    } else {
      setDuplicateError(null)
    }
    
    setNewSpecimenType({
      ...newSpecimenType,
      specimenTypeId,
      specimenTypeName: type?.name || '',
      containerType:
        containerType &&
        allowedContainerTypes.length > 0 &&
        !allowedContainerTypes.includes(containerType)
          ? undefined
          : containerType,
    })
  }

  const handleContainerTypeChange = (containerTypeValue: string) => {
    // Handle empty selection
    if (!containerTypeValue || containerTypeValue === '') {
      setNewSpecimenType({
        ...newSpecimenType,
        containerType: undefined,
      })
      setAllowedSpecimenTypes([])
      setDuplicateError(null)
      return
    }

    const containerType = containerTypeValue as 'paper' | 'cryovial_tube' | 'micronix_tube'

    const specimenTypeId = newSpecimenType.specimenTypeId || 0
    const combinationKey = `${specimenTypeId}-${containerType}`
    
    // Check if this exact combination already exists
    if (specimenTypeId > 0 && addedCombinations.has(combinationKey)) {
      const type = availableSpecimenTypes.find(t => t.id === specimenTypeId)
      const containerTypeName = containerType === 'paper' ? 'DBS Sheet' : 
                                containerType === 'cryovial_tube' ? 'Cryovial' : 
                                'Micronix'
      setDuplicateError(
        `Specimen type "${type?.name || ''}" with container type "${containerTypeName}" has already been added`
      )
    } else {
      setDuplicateError(null)
    }
    
    setNewSpecimenType({
      ...newSpecimenType,
      containerType,
    })
  }

  const constraintReadError =
    containerTypesQuery.isError && specimenTypeId > 0
      ? getQueryErrorMessage(containerTypesQuery.error, 'Failed to load allowed container types')
      : specimenTypesByContainerQuery.isError && newSpecimenType.containerType
        ? getQueryErrorMessage(
            specimenTypesByContainerQuery.error,
            'Failed to load specimen types for this container',
          )
        : null

  return (
    <div className="space-y-6">
      {constraintReadError && <SectionMessage variant="error" message={constraintReadError} />}
      <div>
        <h2 className="text-xl font-semibold text-app-text mb-4">Add Specimen Types</h2>
        <p className="text-sm text-app-text-muted mb-6">
          Add specimen types for this batch. Each specimen type will become one specimen record with multiple containers.
        </p>
      </div>

      {/* Add new specimen type form */}
      <div className="bg-app-surface rounded-lg p-4 border border-app-border">
        <h3 className="text-sm font-semibold text-app-text mb-4">Add Specimen Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="specimen-type" className="block text-sm font-medium text-app-text mb-2">
              Specimen Type *
            </label>
            <select
              id="specimen-type"
              value={newSpecimenType.specimenTypeId || 0}
              onChange={(e) => handleSpecimenTypeSelect(parseInt(e.target.value))}
              disabled={loadingSpecimenTypes}
              className={`block w-full px-3 py-2 border rounded-lg text-sm bg-app-card text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent disabled:opacity-50 disabled:cursor-not-allowed ${
                duplicateError ? 'border-app-trend-down' : 'border-app-border'
              }`}
            >
              <option value={0}>Select specimen type...</option>
              {availableTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {loadingSpecimenTypes && (
              <p className="mt-1 text-xs text-app-text-muted">Loading allowed specimen types...</p>
            )}
            {duplicateError && (
              <p className="mt-1 text-sm text-app-trend-down">{duplicateError}</p>
            )}
          </div>

          <div>
            <label htmlFor="container-type" className="block text-sm font-medium text-app-text mb-2">
              Container Type *
            </label>
            <select
              id="container-type"
              value={newSpecimenType.containerType || ''}
              onChange={(e) => handleContainerTypeChange(e.target.value as any)}
              disabled={loadingContainerTypes}
              className="block w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-card text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select container type...</option>
              {availableContainerTypes.length === 0 ? (
                <>
                  <option value="paper">DBS Sheet (Paper)</option>
                  <option value="cryovial_tube">Cryovial</option>
                  <option value="micronix_tube">Micronix Tube</option>
                </>
              ) : (
                availableContainerTypes.map((ct) => (
                  <option key={ct.value} value={ct.value}>
                    {ct.label}
                  </option>
                ))
              )}
            </select>
            {loadingContainerTypes && (
              <p className="mt-1 text-xs text-app-text-muted">Loading allowed container types...</p>
            )}
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={addSpecimenType}
              disabled={!newSpecimenType.specimenTypeId || !newSpecimenType.containerType || !!duplicateError}
              className="w-full px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Specimen Type
            </button>
          </div>
        </div>
      </div>

      {/* Added specimen types list */}
      {specimenTypes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-app-text mb-3">Added Specimen Types</h3>
          <div className="space-y-2">
            {specimenTypes.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between bg-app-card border border-app-border rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-app-text">{st.specimenTypeName}</span>
                    <span className="text-xs text-app-text-muted">
                      Container: {st.containerType === 'paper' ? 'DBS Sheet' : st.containerType === 'cryovial_tube' ? 'Cryovial' : 'Micronix'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSpecimenType(st.id)}
                  className="text-app-trend-down hover:text-app-trend-down/80 px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alternative: CSV upload */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-app-text">Alternative: CSV Upload</h3>
            <p className="text-xs text-app-text-muted mt-1">
              Upload CSV files instead of manually adding specimen types
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToCSV}
            className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
          >
            Switch to CSV Upload
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={specimenTypes.length === 0}
          className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Configure Containers
        </button>
      </div>
    </div>
  )
}

