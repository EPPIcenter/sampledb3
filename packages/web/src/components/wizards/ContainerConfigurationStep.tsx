import { useState, useEffect, useRef } from 'react'
import LocationPicker from '../LocationPicker'
import { collectionsApi } from '../../lib/api'
import type { SpecimenTypeConfig, CSVFileData, ContainerConfig } from '../../pages/ControlBatchWizard'

interface ContainerConfigurationStepProps {
  specimenTypes: SpecimenTypeConfig[]
  csvFiles: CSVFileData[]
  onChangeSpecimenTypes: (types: SpecimenTypeConfig[]) => void
  onChangeCsvFiles: (files: CSVFileData[]) => void
  onNext: () => void
  onBack: () => void
  onCancel: () => void
}

export default function ContainerConfigurationStep({
  specimenTypes,
  csvFiles,
  onChangeSpecimenTypes,
  onChangeCsvFiles,
  onNext,
  onBack,
  onCancel,
}: ContainerConfigurationStepProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'csv'>(
    csvFiles.length > 0 ? 'csv' : 'manual'
  )
  const [existingCollections, setExistingCollections] = useState<{
    boxes: Map<string, { id: number; locationId: number }>
    bags: Map<string, { id: number; locationId: number }>
  }>({ boxes: new Map(), bags: new Map() })
  const [loadingCollections, setLoadingCollections] = useState(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const existingCollectionsRef = useRef(existingCollections)
  
  // Keep ref in sync with state
  useEffect(() => {
    existingCollectionsRef.current = existingCollections
  }, [existingCollections])

  // Load existing boxes and bags on mount
  useEffect(() => {
    const loadCollections = async () => {
      try {
        setLoadingCollections(true)
        const [boxesRes, bagsRes] = await Promise.all([
          collectionsApi.listCollectionsByType('box'),
          collectionsApi.listCollectionsByType('bag'),
        ])
        
        const boxesMap = new Map<string, { id: number; locationId: number }>()
        boxesRes.data.collections?.forEach((box: any) => {
          if (box.name && box.locationId) {
            boxesMap.set(box.name, { id: box.id, locationId: box.locationId })
          }
        })
        
        const bagsMap = new Map<string, { id: number; locationId: number }>()
        bagsRes.data.collections?.forEach((bag: any) => {
          if (bag.name && bag.locationId) {
            bagsMap.set(bag.name, { id: bag.id, locationId: bag.locationId })
          }
        })
        
        setExistingCollections({ boxes: boxesMap, bags: bagsMap })
      } catch (error) {
        console.error('Failed to load collections:', error)
      } finally {
        setLoadingCollections(false)
      }
    }
    
    loadCollections()
  }, [])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const handleCollectionNameChange = (
    specimenTypeId: string,
    containerIds: string[],
    newName: string,
    collectionType: 'box' | 'bag'
  ) => {
    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Update the name immediately for all containers
    containerIds.forEach(containerId => {
      updateContainer(specimenTypeId, containerId, { collectionName: newName })
    })

    // Only do lookup if name is not empty
    if (!newName.trim()) {
      // Clear collectionId if name is empty, but preserve the empty name
      containerIds.forEach(containerId => {
        updateContainer(specimenTypeId, containerId, {
          collectionName: newName, // Preserve the empty string
          collectionId: undefined,
          collectionLocationId: undefined,
        })
      })
      return
    }

    // Debounce the lookup - capture the name in the closure
    const nameToLookup = newName.trim()
    const originalName = newName // Preserve original (may have whitespace)
    debounceTimerRef.current = setTimeout(() => {
      // Use the latest existingCollections from ref to avoid stale closure
      const currentCollections = existingCollectionsRef.current
      const collection = collectionType === 'box' 
        ? currentCollections.boxes.get(nameToLookup)
        : currentCollections.bags.get(nameToLookup)
      
      if (collection) {
        // Collection exists - auto-populate location and set collectionId
        // Preserve the original collectionName (as user typed it)
        containerIds.forEach(containerId => {
          updateContainer(specimenTypeId, containerId, {
            collectionName: originalName, // Preserve the original name (may have whitespace)
            collectionLocationId: collection.locationId,
            collectionId: collection.id,
          })
        })
      } else {
        // Collection doesn't exist - clear collectionId, allow location to be edited
        // Preserve the original collectionName (as user typed it)
        containerIds.forEach(containerId => {
          updateContainer(specimenTypeId, containerId, {
            collectionName: originalName, // Preserve the original name
            collectionId: undefined,
            // Don't clear locationId - user might have set it manually
          })
        })
      }
    }, 500) // 500ms debounce
  }

  const getCollectionType = (containerType: string): 'box' | 'bag' | 'micronix_plate' | 'cryovial_box' => {
    if (containerType === 'paper') return 'box' // Default to box, user can choose box or bag
    if (containerType === 'cryovial_tube') return 'cryovial_box'
    if (containerType === 'micronix_tube') return 'micronix_plate'
    return 'box'
  }

  const getCollectionLabel = (containerType: string, collectionType?: string): string => {
    if (containerType === 'cryovial_tube') return 'Cryovial Box Name'
    if (containerType === 'micronix_tube') return 'Plate Name'
    if (containerType === 'paper') {
      return collectionType === 'bag' ? 'Bag Name' : 'Box Name'
    }
    return 'Collection Name'
  }

  const getCollectionPlaceholder = (containerType: string, collectionType?: string): string => {
    if (containerType === 'cryovial_tube') return 'Enter cryovial box name'
    if (containerType === 'micronix_tube') return 'Enter plate name'
    if (containerType === 'paper') {
      return collectionType === 'bag' ? 'Enter bag name' : 'Enter box name'
    }
    return 'Enter collection name'
  }

  const handleCSVCollectionConfig = async (
    fileIndex: number,
    containerType: 'paper' | 'cryovial_tube' | 'micronix_tube',
    collectionId: number | null,
    collectionName: string | null,
    collectionLocationId: number | null,
    collectionType: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box',
    sheetName?: string | null
  ) => {
    const updatedFiles = [...csvFiles]
    updatedFiles[fileIndex] = {
      ...updatedFiles[fileIndex],
      containerType,
      collectionId: collectionId || undefined,
      collectionName: collectionName || undefined,
      collectionLocationId: collectionLocationId || undefined,
      collectionType,
      sheetName: sheetName || undefined,
    }
    onChangeCsvFiles(updatedFiles)
  }

  const handleCreateCollection = async (
    fileIndex: number,
    name: string,
    locationId: number,
    collectionType: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  ) => {
    try {
      let response
      if (collectionType === 'box') {
        response = await collectionsApi.createBox({ name, locationId })
      } else if (collectionType === 'bag') {
        response = await collectionsApi.createBag({ name, locationId })
      } else if (collectionType === 'micronix_plate') {
        response = await collectionsApi.createMicronixPlate({ name, locationId })
      } else {
        response = await collectionsApi.createCryovialBox({ name, locationId })
      }

      const collectionId = ('plate' in response.data && response.data.plate?.id) || 
                          ('box' in response.data && response.data.box?.id) || 
                          ('bag' in response.data && response.data.bag?.id) || undefined
      
      const updatedFiles = [...csvFiles]
      updatedFiles[fileIndex] = {
        ...updatedFiles[fileIndex],
        collectionId: typeof collectionId === 'number' ? collectionId : undefined,
        collectionName: name,
        collectionLocationId: locationId,
      }
      onChangeCsvFiles(updatedFiles)
    } catch (error: unknown) {
      console.error('Failed to create collection:', error)
      const errorMessage = typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to create collection'
        : 'Failed to create collection'
      alert(errorMessage)
    }
  }

  const handleCreateCollectionForSpecimenType = async (
    specimenTypeId: string,
    name: string,
    locationId: number,
    collectionType: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  ) => {
    try {
      let response
      if (collectionType === 'box') {
        response = await collectionsApi.createBox({ name, locationId })
      } else if (collectionType === 'bag') {
        response = await collectionsApi.createBag({ name, locationId })
      } else if (collectionType === 'micronix_plate') {
        response = await collectionsApi.createMicronixPlate({ name, locationId })
      } else {
        response = await collectionsApi.createCryovialBox({ name, locationId })
      }

      const collectionId = ('plate' in response.data && response.data.plate?.id) || 
                          ('box' in response.data && response.data.box?.id) || 
                          ('bag' in response.data && response.data.bag?.id) || undefined
      
      // Update all containers for this specimen type with the collection ID
      const updated = specimenTypes.map(st => {
        if (st.id === specimenTypeId) {
          return {
            ...st,
            containers: st.containers.map(c => ({
              ...c,
              collectionId: typeof collectionId === 'number' ? collectionId : undefined,
              collectionName: name,
              collectionLocationId: locationId,
            })),
          }
        }
        return st
      })
      onChangeSpecimenTypes(updated)
    } catch (error: unknown) {
      console.error('Failed to create collection:', error)
      const errorMessage = typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to create collection'
        : 'Failed to create collection'
      alert(errorMessage)
    }
  }

  const addContainerToSpecimenType = (specimenTypeId: string) => {
    const updated = specimenTypes.map(st => {
      if (st.id === specimenTypeId) {
        const newContainer: ContainerConfig = {
          id: `c-${Date.now()}-${Math.random()}`,
          quantity: 1,
          unitSymbol: st.containerType === 'paper' ? 'spots' : 'µL',
        }
        return {
          ...st,
          containers: [...st.containers, newContainer],
        }
      }
      return st
    })
    onChangeSpecimenTypes(updated)
  }

  const addSheetToSpecimenType = (specimenTypeId: string) => {
    const updated = specimenTypes.map(st => {
      if (st.id === specimenTypeId && st.containerType === 'paper') {
        const sheetId = `sheet-${Date.now()}-${Math.random()}`
        const newContainer: ContainerConfig = {
          id: `c-${Date.now()}-${Math.random()}`,
          quantity: 1,
          unitSymbol: 'spots',
          sheetName: '', // Empty initially, user will fill it
          sheetId, // Track which sheet this paper belongs to
        }
        return {
          ...st,
          containers: [...st.containers, newContainer],
        }
      }
      return st
    })
    onChangeSpecimenTypes(updated)
  }

  const addPaperToSheet = (specimenTypeId: string, sheetId: string) => {
    const updated = specimenTypes.map(st => {
      if (st.id === specimenTypeId && st.containerType === 'paper') {
        // Find the first container in this sheet to get sheet name
        const sheetContainer = st.containers.find(c => (c as any).sheetId === sheetId)
        const newContainer: ContainerConfig = {
          id: `c-${Date.now()}-${Math.random()}`,
          quantity: 1,
          unitSymbol: 'spots',
          sheetName: sheetContainer?.sheetName || '',
          sheetId, // Same sheet ID
          collectionType: sheetContainer?.collectionType,
          collectionName: sheetContainer?.collectionName,
          collectionLocationId: sheetContainer?.collectionLocationId,
          collectionId: sheetContainer?.collectionId,
        }
        return {
          ...st,
          containers: [...st.containers, newContainer],
        }
      }
      return st
    })
    onChangeSpecimenTypes(updated)
  }

  const removeSheet = (specimenTypeId: string, sheetId: string) => {
    const updated = specimenTypes.map(st => {
      if (st.id === specimenTypeId) {
        return {
          ...st,
          containers: st.containers.filter(c => (c as any).sheetId !== sheetId),
        }
      }
      return st
    })
    onChangeSpecimenTypes(updated)
  }

  const updateContainer = (specimenTypeId: string, containerId: string, updates: Partial<ContainerConfig>) => {
    const updated = specimenTypes.map(st => {
      if (st.id === specimenTypeId) {
        return {
          ...st,
          containers: st.containers.map(c =>
            c.id === containerId ? { ...c, ...updates } : c
          ),
        }
      }
      return st
    })
    onChangeSpecimenTypes(updated)
  }

  const removeContainer = (specimenTypeId: string, containerId: string) => {
    const updated = specimenTypes.map(st => {
      if (st.id === specimenTypeId) {
        return {
          ...st,
          containers: st.containers.filter(c => c.id !== containerId),
        }
      }
      return st
    })
    onChangeSpecimenTypes(updated)
  }

  const canProceed = () => {
    // Check manual specimen types have containers
    const manualValid = specimenTypes.every(st => st.containers.length > 0)
    
    // Check CSV files have collection assigned and sheet name if paper
    const csvValid = csvFiles.every(f => {
      const hasCollection = f.collectionId || (f.collectionName && f.collectionLocationId)
      if (f.containerType === 'paper') {
        return hasCollection && !!f.sheetName
      }
      return hasCollection
    })
    
    // Check manual paper containers have sheet names
    const manualPaperValid = specimenTypes.every(st => {
      if (st.containerType !== 'paper') return true
      return st.containers.every(c => !!c.sheetName)
    })
    
    return (specimenTypes.length === 0 || (manualValid && manualPaperValid)) && (csvFiles.length === 0 || csvValid)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Configure Containers</h2>
        <p className="text-sm text-gray-600 mb-6">
          Configure containers for each specimen type and assign collections for CSV files.
        </p>
      </div>

      {/* Tabs */}
      {(specimenTypes.length > 0 && csvFiles.length > 0) && (
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'manual'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Manual Entry ({specimenTypes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('csv')}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'csv'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              CSV Files ({csvFiles.length})
            </button>
          </nav>
        </div>
      )}

      {/* Manual specimen types */}
      {(activeTab === 'manual' || csvFiles.length === 0) && specimenTypes.length > 0 && (
        <div className="space-y-6">
          {specimenTypes.map((st) => (
            <div key={st.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{st.specimenTypeName}</h3>
                  <p className="text-sm text-gray-500">
                    Container type: {st.containerType === 'paper' ? 'DBS Sheet' : st.containerType === 'cryovial_tube' ? 'Cryovial' : 'Micronix'}
                  </p>
                </div>
                {st.containerType === 'paper' ? (
                  <button
                    type="button"
                    onClick={() => addSheetToSpecimenType(st.id)}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add Sheet
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => addContainerToSpecimenType(st.id)}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add Container
                  </button>
                )}
              </div>

              {st.containers.length > 0 ? (
                st.containerType === 'paper' ? (
                  // Paper containers: Group by sheet ID, then show box/bag assignment per sheet
                  (() => {
                    // Group containers by sheetId
                    const sheetsMap = new Map<string, typeof st.containers>()
                    st.containers.forEach(c => {
                      const sheetId = (c as any).sheetId || 'unassigned'
                      if (!sheetsMap.has(sheetId)) {
                        sheetsMap.set(sheetId, [])
                      }
                      sheetsMap.get(sheetId)!.push(c)
                    })
                    
                    return (
                      <div className="space-y-4">
                        {Array.from(sheetsMap.entries()).map(([sheetId, containers]) => {
                          const sheetName = containers[0]?.sheetName || ''
                          return (
                            <div key={sheetId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex-1">
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Sheet Name *
                                  </label>
                                  <input
                                    type="text"
                                    value={sheetName}
                                    onChange={(e) => {
                                      const newSheetName = e.target.value
                                      containers.forEach(c => {
                                        updateContainer(st.id, c.id, { sheetName: newSheetName })
                                      })
                                    }}
                                    placeholder="Enter sheet name"
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeSheet(st.id, sheetId)}
                                  className="ml-3 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors"
                                  title="Remove this sheet and all its papers"
                                >
                                  Remove Sheet
                                </button>
                              </div>
                              
                              {/* Papers in this sheet */}
                              <div className="mb-3">
                                <div className="flex items-center justify-between mb-2">
                                  <label className="block text-xs text-gray-600">
                                    Papers in this sheet ({containers.length})
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => addPaperToSheet(st.id, sheetId)}
                                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                  >
                                    + Add Paper
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  {containers.map((container) => (
                                    <div key={container.id} className="grid grid-cols-4 gap-2 items-center bg-white p-2 rounded border border-gray-200">
                                      <input
                                        type="text"
                                        placeholder="Barcode"
                                        value={container.barcode || ''}
                                        onChange={(e) => updateContainer(st.id, container.id, { barcode: e.target.value })}
                                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                                      />
                                      <input
                                        type="text"
                                        placeholder="Position"
                                        value={container.position || ''}
                                        onChange={(e) => updateContainer(st.id, container.id, { position: e.target.value })}
                                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                                      />
                                      <input
                                        type="number"
                                        placeholder="Quantity"
                                        value={container.quantity || ''}
                                        onChange={(e) => updateContainer(st.id, container.id, { quantity: parseFloat(e.target.value) || 0 })}
                                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                                      />
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          placeholder="Unit"
                                          value={container.unitSymbol || ''}
                                          onChange={(e) => updateContainer(st.id, container.id, { unitSymbol: e.target.value })}
                                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                        />
                                      <button
                                        type="button"
                                        onClick={() => removeContainer(st.id, container.id)}
                                        className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 hover:border-red-300 transition-colors"
                                        title="Remove this paper"
                                      >
                                        ×
                                      </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Box/Bag assignment for this sheet */}
                              <div className="mt-3 pt-3 border-t border-gray-300">
                                <h5 className="text-xs font-medium text-gray-700 mb-2">Place Sheet in:</h5>
                                <div className="mb-3">
                                  <label className="block text-xs text-gray-600 mb-1">Collection Type</label>
                                  <select
                                    value={containers[0]?.collectionType || 'box'}
                                    onChange={(e) => {
                                      const type = e.target.value as 'bag' | 'box'
                                      containers.forEach(c => {
                                        updateContainer(st.id, c.id, { collectionType: type })
                                      })
                                    }}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  >
                                    <option value="box">Box</option>
                                    <option value="bag">Bag</option>
                                  </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">
                                      {getCollectionLabel('paper', containers[0]?.collectionType)}
                                    </label>
                                    <input
                                      type="text"
                                      value={containers[0]?.collectionName || ''}
                                      onChange={(e) => {
                                        const name = e.target.value
                                        const collectionType = (containers[0]?.collectionType || 'box') as 'box' | 'bag'
                                        const containerIds = containers.map(c => c.id)
                                        handleCollectionNameChange(st.id, containerIds, name, collectionType)
                                      }}
                                      placeholder={getCollectionPlaceholder('paper', containers[0]?.collectionType)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">Location</label>
                                    <LocationPicker
                                      value={containers[0]?.collectionLocationId || null}
                                      onChange={(locationId) => {
                                        containers.forEach(c => {
                                          updateContainer(st.id, c.id, { collectionLocationId: locationId || undefined })
                                        })
                                      }}
                                      disabled={!!containers[0]?.collectionId}
                                    />
                                    {containers[0]?.collectionId && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        Location from existing {containers[0]?.collectionType === 'bag' ? 'bag' : 'box'}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {containers[0]?.collectionName && containers[0]?.collectionLocationId && !containers[0]?.collectionId && (
                                  <div className="mt-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const firstContainer = containers[0]
                                        if (firstContainer?.collectionName && firstContainer?.collectionLocationId) {
                                          handleCreateCollectionForSpecimenType(
                                            st.id,
                                            firstContainer.collectionName,
                                            firstContainer.collectionLocationId,
                                            firstContainer.collectionType || 'box'
                                          )
                                        }
                                      }}
                                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                    >
                                      Create {containers[0]?.collectionType === 'bag' ? 'Bag' : 'Box'}
                                    </button>
                                  </div>
                                )}
                                {containers[0]?.collectionId && (
                                  <div className="mt-3 bg-green-50 border border-green-200 rounded p-2">
                                    <p className="text-xs text-green-800">
                                      ✓ Sheet will be placed in: {containers[0]?.collectionName}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  // Non-paper containers: Show as before
                  <div className="space-y-2">
                    {st.containers.map((container) => (
                      <div key={container.id} className="grid grid-cols-5 gap-2 items-center bg-gray-50 p-2 rounded">
                        <input
                          type="text"
                          placeholder="Position"
                          value={container.position || ''}
                          onChange={(e) => updateContainer(st.id, container.id, { position: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Barcode"
                          value={container.barcode || ''}
                          onChange={(e) => updateContainer(st.id, container.id, { barcode: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <input
                          type="number"
                          placeholder="Quantity"
                          value={container.quantity || ''}
                          onChange={(e) => updateContainer(st.id, container.id, { quantity: parseFloat(e.target.value) || 0 })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Unit"
                          value={container.unitSymbol || ''}
                          onChange={(e) => updateContainer(st.id, container.id, { unitSymbol: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeContainer(st.id, container.id)}
                          className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 hover:border-red-300 transition-colors"
                          title="Remove this container"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <p className="text-sm text-gray-500 italic">No containers added yet</p>
              )}

              {/* Collection assignment for non-paper containers */}
              {st.containers.length > 0 && st.containerType !== 'paper' && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Assign to Collection</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        {getCollectionLabel(st.containerType, st.containers[0]?.collectionType)}
                      </label>
                      <input
                        type="text"
                        value={st.containers[0]?.collectionName || ''}
                        onChange={(e) => {
                          const name = e.target.value
                          const collectionType = (st.containers[0]?.collectionType || getCollectionType(st.containerType)) as 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
                          if (collectionType === 'box' || collectionType === 'bag') {
                            const containerIds = st.containers.map(c => c.id)
                            handleCollectionNameChange(st.id, containerIds, name, collectionType)
                          } else {
                            st.containers.forEach(c => {
                              updateContainer(st.id, c.id, { collectionName: name })
                            })
                          }
                        }}
                        placeholder={getCollectionPlaceholder(st.containerType, st.containers[0]?.collectionType)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Location</label>
                      <LocationPicker
                        value={st.containers[0]?.collectionLocationId || null}
                        onChange={(locationId) => {
                          st.containers.forEach(c => {
                            updateContainer(st.id, c.id, { collectionLocationId: locationId || undefined })
                          })
                        }}
                        disabled={!!st.containers[0]?.collectionId && (st.containers[0]?.collectionType === 'box' || st.containers[0]?.collectionType === 'bag')}
                      />
                      {st.containers[0]?.collectionId && (st.containers[0]?.collectionType === 'box' || st.containers[0]?.collectionType === 'bag') && (
                        <p className="text-xs text-gray-500 mt-1">
                          Location from existing {st.containers[0]?.collectionType === 'bag' ? 'bag' : 'box'}
                        </p>
                      )}
                    </div>
                  </div>
                  {st.containers[0]?.collectionName && st.containers[0]?.collectionLocationId && !st.containers[0]?.collectionId && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          const firstContainer = st.containers[0]
                          if (firstContainer?.collectionName && firstContainer?.collectionLocationId) {
                            handleCreateCollectionForSpecimenType(
                              st.id,
                              firstContainer.collectionName,
                              firstContainer.collectionLocationId,
                              firstContainer.collectionType || getCollectionType(st.containerType)
                            )
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Create Collection
                      </button>
                    </div>
                  )}
                  {st.containers[0]?.collectionId && (
                    <div className="mt-3 bg-green-50 border border-green-200 rounded p-2">
                      <p className="text-xs text-green-800">
                        ✓ Assigned to collection: {st.containers[0]?.collectionName}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CSV files */}
      {(activeTab === 'csv' || specimenTypes.length === 0) && csvFiles.length > 0 && (
        <div className="space-y-6">
          {csvFiles.map((file, fileIndex) => {
            const selectedContainerType = file.containerType || 'paper'
            const collectionType = getCollectionType(selectedContainerType)
            const needsBoxOrBag = selectedContainerType === 'paper'

            return (
              <div key={fileIndex} className="border border-gray-200 rounded-lg p-4">
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900">{file.filename}</h3>
                  <p className="text-sm text-gray-500">
                    {file.rows.length} containers, {new Set(file.rows.map(r => r.specimen_type_name)).size} specimen type(s)
                  </p>
                </div>

                {/* Container type selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Container Type *
                  </label>
                  <select
                    value={selectedContainerType}
                    onChange={(e) => {
                      const type = e.target.value as 'paper' | 'cryovial_tube' | 'micronix_tube'
                      handleCSVCollectionConfig(
                        fileIndex,
                        type,
                        null,
                        null,
                        null,
                        getCollectionType(type),
                        type === 'paper' ? file.sheetName || null : null
                      )
                    }}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="paper">DBS Sheet (Paper)</option>
                    <option value="cryovial_tube">Cryovial</option>
                    <option value="micronix_tube">Micronix Tube</option>
                  </select>
                </div>

                {/* Sheet name for paper containers */}
                {selectedContainerType === 'paper' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sheet Name *
                    </label>
                    <input
                      type="text"
                      value={file.sheetName || ''}
                      onChange={(e) => {
                        handleCSVCollectionConfig(
                          fileIndex,
                          selectedContainerType,
                          file.collectionId || null,
                          file.collectionName || null,
                          file.collectionLocationId || null,
                          file.collectionType || collectionType,
                          e.target.value
                        )
                      }}
                      placeholder="Enter sheet name"
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                )}

                {/* Collection assignment */}
                {needsBoxOrBag && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Collection Type
                    </label>
                    <select
                      value={file.collectionType === 'bag' ? 'bag' : 'box'}
                      onChange={(e) => {
                        const type = e.target.value === 'bag' ? 'bag' : 'box'
                        handleCSVCollectionConfig(
                          fileIndex,
                          selectedContainerType,
                          file.collectionId || null,
                          file.collectionName || null,
                          file.collectionLocationId || null,
                          type,
                          file.sheetName || null
                        )
                      }}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="box">Box</option>
                      <option value="bag">Bag</option>
                    </select>
                  </div>
                )}

                {file.collectionId ? (
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <p className="text-sm text-green-800">
                      ✓ Assigned to collection: {file.collectionName}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Collection Name *
                      </label>
                      <input
                        type="text"
                        value={file.collectionName || ''}
                        onChange={(e) => {
                          const name = e.target.value
                          const collectionTypeValue: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box' = (file.collectionType || collectionType) as 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
                          
                          // Update name immediately
                          handleCSVCollectionConfig(
                            fileIndex,
                            selectedContainerType,
                            null,
                            name,
                            file.collectionLocationId || null,
                            file.collectionType || collectionType,
                            file.sheetName || null
                          )
                          
                          // Handle empty name - clear collectionId
                          if (!name.trim() && (collectionType === 'box' || collectionType === 'bag')) {
                            if (debounceTimerRef.current) {
                              clearTimeout(debounceTimerRef.current)
                            }
                            handleCSVCollectionConfig(
                              fileIndex,
                              selectedContainerType,
                              null,
                              name, // Preserve empty string
                              null, // Clear location
                              collectionType,
                              file.sheetName || null
                            )
                            return
                          }
                          
                          // Auto-populate location if collection exists
                          if ((collectionType === 'box' || collectionType === 'bag') && name.trim()) {
                            if (debounceTimerRef.current) {
                              clearTimeout(debounceTimerRef.current)
                            }
                            
                            debounceTimerRef.current = setTimeout(() => {
                              const nameToLookup = name.trim()
                              const currentCollections = existingCollectionsRef.current
                              const collection = collectionType === 'box'
                                ? currentCollections.boxes.get(nameToLookup)
                                : currentCollections.bags.get(nameToLookup)
                              
                              if (collection) {
                                handleCSVCollectionConfig(
                                  fileIndex,
                                  selectedContainerType,
                                  collection.id,
                                  name, // Preserve the name (may have whitespace)
                                  collection.locationId,
                                  collectionType,
                                  file.sheetName || null
                                )
                              } else {
                                handleCSVCollectionConfig(
                                  fileIndex,
                                  selectedContainerType,
                                  null,
                                  name, // Preserve the name
                                  file.collectionLocationId || null,
                                  collectionType,
                                  file.sheetName || null
                                )
                              }
                            }, 500)
                          }
                        }}
                        placeholder="Enter collection name"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Location *
                      </label>
                      <LocationPicker
                        value={file.collectionLocationId || null}
                        onChange={(locationId) => {
                          handleCSVCollectionConfig(
                            fileIndex,
                            selectedContainerType,
                            file.collectionId || null,
                            file.collectionName || null,
                            locationId,
                            file.collectionType || collectionType,
                            file.sheetName || null
                          )
                        }}
                        disabled={!!file.collectionId && (file.collectionType === 'box' || file.collectionType === 'bag')}
                      />
                      {file.collectionId && (file.collectionType === 'box' || file.collectionType === 'bag') && (
                        <p className="text-xs text-gray-500 mt-1">
                          Location from existing {file.collectionType === 'bag' ? 'bag' : 'box'}
                        </p>
                      )}
                    </div>

                    {file.collectionName && file.collectionLocationId && (
                      <button
                        type="button"
                        onClick={() => {
                          if (file.collectionName && file.collectionLocationId) {
                            handleCreateCollection(
                              fileIndex,
                              file.collectionName,
                              file.collectionLocationId,
                              file.collectionType || collectionType
                            )
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Create Collection
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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
          disabled={!canProceed()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Review
        </button>
      </div>
    </div>
  )
}

