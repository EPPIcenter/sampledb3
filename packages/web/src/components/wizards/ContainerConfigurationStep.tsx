import { useState, useEffect, useRef, useMemo } from 'react'
import LocationPicker from '../LocationPicker'
import SheetCard from './SheetCard'
import CollectionAssignment from './CollectionAssignment'
import type { CollectionAssignmentChange } from './CollectionAssignment'
import { collectionsApi } from '../../lib/api'
import type { SpecimenTypeConfig, CSVFileData, ContainerConfig } from '../../pages/ControlBatchWizard'

/** Group paper containers by sheetId */
function groupContainersBySheet(
  specimenTypes: SpecimenTypeConfig[]
): Map<string, Map<string, ContainerConfig[]>> {
  const result = new Map<string, Map<string, ContainerConfig[]>>()
  for (const st of specimenTypes) {
    if (st.containerType !== 'paper') continue
    const sheetsMap = new Map<string, ContainerConfig[]>()
    for (const c of st.containers) {
      const sheetId = (c as ContainerConfig & { sheetId?: string }).sheetId ?? 'unassigned'
      if (!sheetsMap.has(sheetId)) {
        sheetsMap.set(sheetId, [])
      }
      sheetsMap.get(sheetId)!.push(c)
    }
    if (sheetsMap.size > 0) {
      result.set(st.id, sheetsMap)
    }
  }
  return result
}

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

  const sheetsBySpecimen = useMemo(
    () => groupContainersBySheet(specimenTypes),
    [specimenTypes]
  )

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
        <h2 className="blood-controls-section-title text-xl font-semibold mb-4">
          Configure Containers
        </h2>
        <p className="text-sm mb-6" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
          Configure containers for each specimen type and assign collections for CSV files.
        </p>
      </div>

      {/* Tabs */}
      {(specimenTypes.length > 0 && csvFiles.length > 0) && (
        <div className="border-b" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
          <nav className="flex -mb-px blood-controls-tabs">
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'manual' ? 'blood-controls-tab-active' : ''
              }`}
              aria-selected={activeTab === 'manual'}
            >
              Manual Entry ({specimenTypes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('csv')}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'csv' ? 'blood-controls-tab-active' : ''
              }`}
              aria-selected={activeTab === 'csv'}
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
            <div
              key={st.id}
              className="dashboard-card rounded-lg p-6"
              style={{ borderColor: 'rgb(var(--dashboard-border))' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold" style={{ color: 'rgb(var(--dashboard-text))' }}>
                    {st.specimenTypeName}
                  </h3>
                  <p className="text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                    Container type:{' '}
                    {st.containerType === 'paper'
                      ? 'DBS Sheet'
                      : st.containerType === 'cryovial_tube'
                        ? 'Cryovial'
                        : 'Micronix'}
                  </p>
                </div>
                {st.containerType === 'paper' ? (
                  <button
                    type="button"
                    onClick={() => addSheetToSpecimenType(st.id)}
                    className="blood-controls-btn-primary px-3 py-1.5 text-sm"
                  >
                    Add Sheet
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => addContainerToSpecimenType(st.id)}
                    className="blood-controls-btn-primary px-3 py-1.5 text-sm"
                  >
                    Add Container
                  </button>
                )}
              </div>

              {st.containers.length > 0 ? (
                st.containerType === 'paper' ? (
                  <div className="space-y-4">
                    {(() => {
                      const sheetsMap = sheetsBySpecimen.get(st.id)
                      if (!sheetsMap) return null
                      return Array.from(sheetsMap.entries()).map(([sheetId, containers]) => (
                        <SheetCard
                          key={sheetId}
                          sheetId={sheetId}
                          containers={containers}
                          specimenTypeId={st.id}
                          onUpdateSheetName={(name) => {
                            containers.forEach((c) =>
                              updateContainer(st.id, c.id, { sheetName: name })
                            )
                          }}
                          onUpdateContainer={updateContainer}
                          onRemoveSheet={() => removeSheet(st.id, sheetId)}
                          onAddPaper={() => addPaperToSheet(st.id, sheetId)}
                          onRemoveContainer={removeContainer}
                          onCollectionChange={(updates: CollectionAssignmentChange) => {
                            if (updates.collectionName !== undefined) {
                              const collectionType =
                                (containers[0]?.collectionType ?? 'box') as 'box' | 'bag'
                              handleCollectionNameChange(
                                st.id,
                                containers.map((c) => c.id),
                                updates.collectionName,
                                collectionType
                              )
                            }
                            if (updates.collectionType !== undefined) {
                              containers.forEach((c) =>
                                updateContainer(st.id, c.id, {
                                  collectionType: updates.collectionType,
                                })
                              )
                            }
                            if (updates.collectionLocationId !== undefined) {
                              containers.forEach((c) =>
                                updateContainer(st.id, c.id, {
                                  collectionLocationId:
                                    updates.collectionLocationId ?? undefined,
                                })
                              )
                            }
                          }}
                          onCreateCollection={() => {
                            const first = containers[0]
                            if (
                              first?.collectionName &&
                              first?.collectionLocationId
                            ) {
                              handleCreateCollectionForSpecimenType(
                                st.id,
                                first.collectionName,
                                first.collectionLocationId,
                                (first.collectionType ?? 'box') as
                                  | 'box'
                                  | 'bag'
                                  | 'micronix_plate'
                                  | 'cryovial_box'
                              )
                            }
                          }}
                          existingCollections={existingCollections}
                        />
                      ))
                    })()}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {st.containers.map((container) => (
                        <div
                          key={container.id}
                          className="grid grid-cols-5 gap-2 items-center p-2 rounded"
                          style={{ backgroundColor: 'rgb(var(--dashboard-surface))' }}
                        >
                          <input
                            type="text"
                            placeholder="Position"
                            value={container.position || ''}
                            onChange={(e) =>
                              updateContainer(st.id, container.id, {
                                position: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Barcode"
                            value={container.barcode || ''}
                            onChange={(e) =>
                              updateContainer(st.id, container.id, {
                                barcode: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <input
                            type="number"
                            placeholder="Quantity"
                            value={container.quantity ?? ''}
                            onChange={(e) =>
                              updateContainer(st.id, container.id, {
                                quantity: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Unit"
                            value={container.unitSymbol || ''}
                            onChange={(e) =>
                              updateContainer(st.id, container.id, {
                                unitSymbol: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeContainer(st.id, container.id)}
                            className="blood-controls-btn-danger px-2 py-1 text-xs"
                            title="Remove this container"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="pt-4 border-t" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
                      <h4 className="blood-controls-filter-label mb-2">
                        Assign to Collection
                      </h4>
                      <CollectionAssignment
                        containerType={st.containerType}
                        collectionType={
                          (st.containers[0]?.collectionType ||
                            getCollectionType(st.containerType)) as
                            | 'box'
                            | 'bag'
                            | 'micronix_plate'
                            | 'cryovial_box'
                        }
                        collectionName={st.containers[0]?.collectionName ?? ''}
                        collectionLocationId={
                          st.containers[0]?.collectionLocationId ?? null
                        }
                        collectionId={st.containers[0]?.collectionId}
                        onChange={(updates: CollectionAssignmentChange) => {
                          if (updates.collectionName !== undefined) {
                            const ct =
                              (st.containers[0]?.collectionType ||
                                getCollectionType(st.containerType)) as
                                | 'box'
                                | 'bag'
                                | 'micronix_plate'
                                | 'cryovial_box'
                            if (ct === 'box' || ct === 'bag') {
                              handleCollectionNameChange(
                                st.id,
                                st.containers.map((c) => c.id),
                                updates.collectionName,
                                ct
                              )
                            } else {
                              st.containers.forEach((c) =>
                                updateContainer(st.id, c.id, {
                                  collectionName: updates.collectionName,
                                })
                              )
                            }
                          }
                          if (updates.collectionType !== undefined) {
                            st.containers.forEach((c) =>
                              updateContainer(st.id, c.id, {
                                collectionType: updates.collectionType,
                              })
                            )
                          }
                          if (updates.collectionLocationId !== undefined) {
                            st.containers.forEach((c) =>
                              updateContainer(st.id, c.id, {
                                collectionLocationId:
                                  updates.collectionLocationId ?? undefined,
                              })
                            )
                          }
                        }}
                        onCreate={() => {
                          const first = st.containers[0]
                          if (
                            first?.collectionName &&
                            first?.collectionLocationId
                          ) {
                            handleCreateCollectionForSpecimenType(
                              st.id,
                              first.collectionName,
                              first.collectionLocationId,
                              (first.collectionType ||
                                getCollectionType(st.containerType)) as
                                | 'box'
                                | 'bag'
                                | 'micronix_plate'
                                | 'cryovial_box'
                            )
                          }
                        }}
                        showCollectionTypeSelector={false}
                        successMessageVariant="collection"
                      />
                    </div>
                  </div>
                )
              ) : (
                <p
                  className="text-sm italic"
                  style={{ color: 'rgb(var(--dashboard-text-muted))' }}
                >
                  No containers added yet
                </p>
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
              <div
                key={fileIndex}
                className="dashboard-card rounded-lg p-6"
                style={{ borderColor: 'rgb(var(--dashboard-border))' }}
              >
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
                        filterCollectionsOnly
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

      <div
        className="flex justify-end gap-3 pt-4 border-t"
        style={{ borderColor: 'rgb(var(--dashboard-border))' }}
      >
        <button type="button" onClick={onCancel} className="blood-controls-btn-secondary px-4 py-2">
          Cancel
        </button>
        <button type="button" onClick={onBack} className="blood-controls-btn-secondary px-4 py-2">
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed()}
          className="blood-controls-btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Review
        </button>
      </div>
    </div>
  )
}

