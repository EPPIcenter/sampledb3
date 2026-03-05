import { useState, useEffect } from 'react'
import { specimenTypesApi } from '../../lib/api'
import type { SpecimenType } from '../../lib/api'
import type { SpecimenTypeConfig } from '../../pages/ControlBatchWizard'

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
  const [loadingContainerTypes, setLoadingContainerTypes] = useState(false)
  const [loadingSpecimenTypes, setLoadingSpecimenTypes] = useState(false)

  // Get already added combinations of specimen type ID and container type
  const addedCombinations = new Set(
    specimenTypes.map(st => `${st.specimenTypeId}-${st.containerType}`)
  )
  
  // Fetch allowed container types when specimen type is selected
  useEffect(() => {
    const fetchContainerTypes = async () => {
      if (newSpecimenType.specimenTypeId && newSpecimenType.specimenTypeId > 0) {  
        setLoadingContainerTypes(true)
        try {
          const response = await specimenTypesApi.getContainerTypes(newSpecimenType.specimenTypeId)
          const containerTypes = response.data.containerTypes
          setAllowedContainerTypes(containerTypes)
          
          // If current container type is not allowed, reset to first allowed option or 'paper'
          if (newSpecimenType.containerType && containerTypes.length > 0) {  
            if (!containerTypes.includes(newSpecimenType.containerType)) {
              setNewSpecimenType(prev => ({
                ...prev,
                containerType: containerTypes[0] as 'paper' | 'cryovial_tube' | 'micronix_tube',
              }))
            }
          }
        } catch (error) {
          console.error('Error fetching container types:', error)
          // Fall back to showing all options
          setAllowedContainerTypes([])
        } finally {
          setLoadingContainerTypes(false)
        }
      } else {
        // No specimen type selected, clear constraints
        setAllowedContainerTypes([])
      }
    }
    
    fetchContainerTypes()
  }, [newSpecimenType.specimenTypeId])
  
  // Fetch allowed specimen types when container type is selected
  useEffect(() => {
    const fetchSpecimenTypes = async () => {
      if (newSpecimenType.containerType) {
        setLoadingSpecimenTypes(true)
        try {
          const response = await specimenTypesApi.getByContainerType(newSpecimenType.containerType)
          const specimenTypes = response.data.specimenTypes
          setAllowedSpecimenTypes(specimenTypes)
          
          // If current specimen type is not allowed, reset to empty
           
          if (newSpecimenType.specimenTypeId && specimenTypes.length > 0) {
            const isAllowed = specimenTypes.some(st => st.id === newSpecimenType.specimenTypeId)
            if (!isAllowed) {
              setNewSpecimenType(prev => ({
                ...prev,
                specimenTypeId: 0,
                specimenTypeName: '',
              }))
            }
          }
        } catch (error) {
          console.error('Error fetching specimen types:', error)
          // Fall back to showing all options
          setAllowedSpecimenTypes([])
        } finally {
          setLoadingSpecimenTypes(false)
        }
      } else {
        // No container type selected, clear constraints
        setAllowedSpecimenTypes([])
      }
    }
    
    fetchSpecimenTypes()
  }, [newSpecimenType.containerType])
  
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

  const handleSpecimenTypeSelect = async (specimenTypeId: number) => {
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
    
    // Fetch allowed container types for this specimen type
    if (specimenTypeId > 0) {
      try {
        const response = await specimenTypesApi.getContainerTypes(specimenTypeId)
        const containerTypes = response.data.containerTypes
        setAllowedContainerTypes(containerTypes)
        
        // Validate current container type selection - if invalid, clear it
        if (containerTypes.length > 0 && containerType && !containerTypes.includes(containerType)) {  
          // Clear container type selection if it's not allowed
          setNewSpecimenType({
            ...newSpecimenType,
            specimenTypeId,
            specimenTypeName: type?.name || '',
            containerType: undefined,
          })
          return
        }
      } catch (error) {
        console.error('Error fetching container types:', error)
        // Continue with update even if fetch fails
      }
    }
    
    setNewSpecimenType({
      ...newSpecimenType,
      specimenTypeId,
      specimenTypeName: type?.name || '',
    })
  }

  const handleContainerTypeChange = async (containerTypeValue: string) => {
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
    
    // Fetch allowed specimen types for this container type
    try {
      const response = await specimenTypesApi.getByContainerType(containerType)
      const specimenTypes = response.data.specimenTypes
      setAllowedSpecimenTypes(specimenTypes)
      
      // Validate current specimen type selection
      if (specimenTypes.length > 0 && specimenTypeId > 0) {
        const isAllowed = specimenTypes.some(st => st.id === specimenTypeId)
        if (!isAllowed) {
          // Reset specimen type selection
          setNewSpecimenType({
            ...newSpecimenType,
            containerType,
            specimenTypeId: 0,
            specimenTypeName: '',
          })
          return
        }
      }
    } catch (error) {
      console.error('Error fetching specimen types:', error)
      // Continue with update even if fetch fails
    }
    
    setNewSpecimenType({
      ...newSpecimenType,
      containerType,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Specimen Types</h2>
        <p className="text-sm text-gray-600 mb-6">
          Add specimen types for this batch. Each specimen type will become one specimen record with multiple containers.
        </p>
      </div>

      {/* Add new specimen type form */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Add Specimen Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="specimen-type" className="block text-sm font-medium text-gray-700 mb-2">
              Specimen Type *
            </label>
            <select
              id="specimen-type"
              value={newSpecimenType.specimenTypeId || 0}
              onChange={(e) => handleSpecimenTypeSelect(parseInt(e.target.value))}
              disabled={loadingSpecimenTypes}
              className={`block w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                duplicateError ? 'border-red-300' : 'border-gray-300'
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
              <p className="mt-1 text-xs text-gray-500">Loading allowed specimen types...</p>
            )}
            {duplicateError && (
              <p className="mt-1 text-sm text-red-600">{duplicateError}</p>
            )}
          </div>

          <div>
            <label htmlFor="container-type" className="block text-sm font-medium text-gray-700 mb-2">
              Container Type *
            </label>
            <select
              id="container-type"
              value={newSpecimenType.containerType || ''}
              onChange={(e) => handleContainerTypeChange(e.target.value as any)}
              disabled={loadingContainerTypes}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <p className="mt-1 text-xs text-gray-500">Loading allowed container types...</p>
            )}
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={addSpecimenType}
              disabled={!newSpecimenType.specimenTypeId || !newSpecimenType.containerType || !!duplicateError}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Specimen Type
            </button>
          </div>
        </div>
      </div>

      {/* Added specimen types list */}
      {specimenTypes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Added Specimen Types</h3>
          <div className="space-y-2">
            {specimenTypes.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">{st.specimenTypeName}</span>
                    <span className="text-xs text-gray-500">
                      Container: {st.containerType === 'paper' ? 'DBS Sheet' : st.containerType === 'cryovial_tube' ? 'Cryovial' : 'Micronix'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSpecimenType(st.id)}
                  className="text-red-600 hover:text-red-700 px-2 py-1"
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
            <h3 className="text-sm font-semibold text-gray-900">Alternative: CSV Upload</h3>
            <p className="text-xs text-gray-600 mt-1">
              Upload CSV files instead of manually adding specimen types
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToCSV}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Switch to CSV Upload
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={specimenTypes.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Configure Containers
        </button>
      </div>
    </div>
  )
}

