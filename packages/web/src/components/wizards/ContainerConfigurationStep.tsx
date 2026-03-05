import { useState, useEffect, useRef, useMemo } from 'react'
import LocationPicker from '../LocationPicker'
import SheetCard from './SheetCard'
import CollectionAssignment from './CollectionAssignment'
import CollectionNameSearch from './CollectionNameSearch'
import type { CollectionAssignmentChange } from './CollectionAssignment'
import { collectionsApi } from '../../lib/api'
import { uniqueSheetNamesFromRows } from '../../lib/control-batch-csv'
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
    micronix_plate: Map<string, { id: number; locationId: number }>
    cryovial_box: Map<string, { id: number; locationId: number }>
  }>({ boxes: new Map(), bags: new Map(), micronix_plate: new Map(), cryovial_box: new Map() })
  /** Collection names by type for in-memory search (combobox). */
  const [collectionNamesByType, setCollectionNamesByType] = useState<{
    box: string[]
    bag: string[]
    micronix_plate: string[]
    cryovial_box: string[]
  }>({ box: [], bag: [], micronix_plate: [], cryovial_box: [] })
  const [loadingCollections, setLoadingCollections] = useState(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const existingCollectionsRef = useRef(existingCollections)

  // Keep ref in sync with state
  useEffect(() => {
    existingCollectionsRef.current = existingCollections
  }, [existingCollections])

  // Load all collection types on mount (for id lookup and for name search)
  useEffect(() => {
    const loadCollections = async () => {
      try {
        setLoadingCollections(true)
        const [boxesRes, bagsRes, platesRes, cryovialRes] = await Promise.all([
          collectionsApi.listCollectionsByType('box'),
          collectionsApi.listCollectionsByType('bag'),
          collectionsApi.listCollectionsByType('micronix_plate'),
          collectionsApi.listCollectionsByType('cryovial_box'),
        ])

        const boxesMap = new Map<string, { id: number; locationId: number }>()
        const boxNames: string[] = []
        boxesRes.data.collections?.forEach((box: { id: number; name?: string; locationId?: number | null }) => {
          if (box.name && box.locationId != null) {
            boxesMap.set(box.name, { id: box.id, locationId: box.locationId })
            boxNames.push(box.name)
          }
        })

        const bagsMap = new Map<string, { id: number; locationId: number }>()
        const bagNames: string[] = []
        bagsRes.data.collections?.forEach((bag: { id: number; name?: string; locationId?: number | null }) => {
          if (bag.name && bag.locationId != null) {
            bagsMap.set(bag.name, { id: bag.id, locationId: bag.locationId })
            bagNames.push(bag.name)
          }
        })

        const platesMap = new Map<string, { id: number; locationId: number }>()
        const plateNames: string[] = []
        platesRes.data.collections?.forEach((p: { id: number; name?: string; locationId?: number | null }) => {
          if (p.name && p.locationId != null) {
            platesMap.set(p.name, { id: p.id, locationId: p.locationId })
            plateNames.push(p.name)
          }
        })
        const cryovialMap = new Map<string, { id: number; locationId: number }>()
        const cryovialNames: string[] = []
        cryovialRes.data.collections?.forEach((c: { id: number; name?: string; locationId?: number | null }) => {
          if (c.name && c.locationId != null) {
            cryovialMap.set(c.name, { id: c.id, locationId: c.locationId })
            cryovialNames.push(c.name)
          }
        })

        setExistingCollections({ boxes: boxesMap, bags: bagsMap, micronix_plate: platesMap, cryovial_box: cryovialMap })
        setCollectionNamesByType({
          box: boxNames.sort((a, b) => a.localeCompare(b)),
          bag: bagNames.sort((a, b) => a.localeCompare(b)),
          micronix_plate: plateNames.sort((a, b) => a.localeCompare(b)),
          cryovial_box: cryovialNames.sort((a, b) => a.localeCompare(b)),
        })
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

  const getCollectionFromMaps = (
    name: string,
    collectionType: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  ): { id: number; locationId: number } | undefined => {
    const current = existingCollectionsRef.current
    switch (collectionType) {
      case 'box':
        return current.boxes.get(name)
      case 'bag':
        return current.bags.get(name)
      case 'micronix_plate':
        return current.micronix_plate.get(name)
      case 'cryovial_box':
        return current.cryovial_box.get(name)
    }
  }

  const handleCollectionNameChange = (
    specimenTypeId: string,
    containerIds: string[],
    newName: string,
    collectionType: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
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
      const collection = getCollectionFromMaps(nameToLookup, collectionType)

      if (collection) {
        // Collection exists - auto-populate location and set collectionId
        containerIds.forEach(containerId => {
          updateContainer(specimenTypeId, containerId, {
            collectionName: originalName,
            collectionLocationId: collection.locationId,
            collectionId: collection.id,
          })
        })
      } else {
        // Collection doesn't exist - clear collectionId, allow location to be edited
        containerIds.forEach(containerId => {
          updateContainer(specimenTypeId, containerId, {
            collectionName: originalName,
            collectionId: undefined,
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
    sheetName?: string | null,
    containerTypeInferred?: boolean
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
      ...(containerTypeInferred !== undefined && { containerTypeInferred }),
    }
    onChangeCsvFiles(updatedFiles)
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
    
    // CSV files with rows must have category inferred (paper or tube) and type set (tube = user picks cryovial/micronix)
    const csvContainerTypeValid = csvFiles.every(f =>
      f.rows.length === 0 ||
      (f.containerTypeInferred === true && f.containerType != null) ||
      (f.containerCategoryInferred === 'tube' && (f.containerType === 'cryovial_tube' || f.containerType === 'micronix_tube'))
    )
    
    // Check CSV files have collection assigned and sheet name(s) if paper (per-row sheet_name or per-file sheetName)
    const csvValid = csvFiles.every(f => {
      const hasCollection = f.collectionId || (f.collectionName && f.collectionLocationId)
      if (f.containerType === 'paper') {
        const hasSheetNames = !!f.sheetName?.trim() || (f.rows?.length > 0 && f.rows.every(r => !!(r.sheet_name?.trim())))
        return hasCollection && hasSheetNames
      }
      return hasCollection
    })
    
    // Check manual paper containers have sheet names
    const manualPaperValid = specimenTypes.every(st => {
      if (st.containerType !== 'paper') return true
      return st.containers.every(c => !!c.sheetName)
    })
    
    return (specimenTypes.length === 0 || (manualValid && manualPaperValid)) && (csvFiles.length === 0 || (csvContainerTypeValid && csvValid))
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
                          existingCollections={existingCollections}
                          collectionNames={{
                            box: collectionNamesByType.box,
                            bag: collectionNamesByType.bag,
                          }}
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
                            handleCollectionNameChange(
                              st.id,
                              st.containers.map((c) => c.id),
                              updates.collectionName,
                              ct
                            )
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
                        showCollectionTypeSelector={false}
                        successMessageVariant="collection"
                        collectionNames={
                          collectionNamesByType[
                            (st.containers[0]?.collectionType ||
                              getCollectionType(st.containerType)) as
                              | 'box'
                              | 'bag'
                              | 'micronix_plate'
                              | 'cryovial_box'
                          ]
                        }
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
            const selectedContainerType = file.containerType || (file.containerCategoryInferred === 'tube' ? 'cryovial_tube' : 'paper')
            const collectionType = getCollectionType(selectedContainerType)
            const needsBoxOrBag = selectedContainerType === 'paper'
            const cannotInferContainerType = file.rows.length > 0 && !file.containerTypeInferred && file.containerCategoryInferred !== 'tube'
            const isTubeTemplate = file.containerCategoryInferred === 'tube'

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

                {cannotInferContainerType ? (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200" role="alert">
                    <p className="text-sm text-red-800 font-medium">Container type could not be inferred from this CSV.</p>
                    <p className="text-sm text-red-700 mt-1">
                      Re-upload using a template with <code className="px-1 py-0.5 rounded bg-red-100">sheet_name</code> (DBS) or <code className="px-1 py-0.5 rounded bg-red-100">position</code> (tubes). Remove this file and upload again from the previous step.
                    </p>
                  </div>
                ) : (
                <>
                {/* Container type: read-only when paper inferred; dropdown (Cryovial/Micronix only) when tube template */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Container Type *
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {file.containerTypeInferred ? (
                      <>
                        <span className="block px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
                          DBS Sheet (Paper)
                        </span>
                        <span className="text-xs" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                          (inferred from CSV)
                        </span>
                      </>
                    ) : isTubeTemplate ? (
                      <>
                        <select
                          value={selectedContainerType}
                          onChange={(e) => {
                            const type = e.target.value as 'cryovial_tube' | 'micronix_tube'
                            handleCSVCollectionConfig(
                              fileIndex,
                              type,
                              file.collectionId ?? null,
                              file.collectionName ?? null,
                              file.collectionLocationId ?? null,
                              getCollectionType(type),
                              file.sheetName || null,
                              false
                            )
                          }}
                          className="block px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="cryovial_tube">Cryovial</option>
                          <option value="micronix_tube">Micronix Tube</option>
                        </select>
                        <span className="text-xs" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                          (tube template – choose type)
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Sheet name for paper containers: show inferred from CSV (read-only) or editable field when no sheet_name column */}
                {selectedContainerType === 'paper' && (() => {
                  const names = uniqueSheetNamesFromRows(file.rows)
                  if (names.length === 1) {
                    return (
                      <div className="mb-4">
                        <p className="text-sm text-gray-700">
                          Sheet name: <strong>{file.sheetName || names[0]}</strong> <span className="text-xs" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>(from CSV)</span>
                        </p>
                      </div>
                    )
                  }
                  if (names.length > 1) {
                    return (
                      <div className="mb-4">
                        <p className="text-sm text-gray-700">
                          Sheet names from CSV: <strong>{names.join(', ')}</strong>
                        </p>
                      </div>
                    )
                  }
                  return (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Sheet name (if one sheet for whole file)
                      </label>
                      <p className="text-xs mb-1" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                        Add a <code className="px-1 py-0.5 rounded bg-gray-100">sheet_name</code> column to your CSV to put papers on multiple sheets, or enter one name below. All sheets go into the collection (box/bag) below.
                      </p>
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
                        placeholder="e.g. Sheet1"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  )
                })()}

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

                {file.collectionId && file.collectionName && (
                  <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded p-3 mb-2">
                    <p className="text-sm text-green-800">
                      ✓ Assigned to collection: {file.collectionName}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        handleCSVCollectionConfig(
                          fileIndex,
                          selectedContainerType,
                          null,
                          '',
                          null,
                          file.collectionType || collectionType,
                          file.sheetName || null
                        )
                      }
                      className="text-sm text-green-700 underline hover:no-underline shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <CollectionNameSearch
                        id={`csv-collection-name-${fileIndex}`}
                        label="Collection Name *"
                        value={file.collectionName || ''}
                        onChange={(name) => {
                          handleCSVCollectionConfig(
                            fileIndex,
                            selectedContainerType,
                            null,
                            name,
                            file.collectionLocationId || null,
                            file.collectionType || collectionType,
                            file.sheetName || null
                          )
                          if (!name.trim()) {
                            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
                            handleCSVCollectionConfig(
                              fileIndex,
                              selectedContainerType,
                              null,
                              name,
                              null,
                              collectionType,
                              file.sheetName || null
                            )
                            return
                          }
                          if (
                            (collectionType === 'box' ||
                              collectionType === 'bag' ||
                              collectionType === 'micronix_plate' ||
                              collectionType === 'cryovial_box') &&
                            name.trim()
                          ) {
                            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
                            const nameToLookup = name.trim()
                            const currentCollections = existingCollectionsRef.current
                            const collection = getCollectionFromMaps(nameToLookup, collectionType)
                            const optionsForType =
                              collectionNamesByType[
                                collectionType as 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
                              ] ?? []
                            const isExactMatch = optionsForType.some((opt) => opt.trim() === nameToLookup)
                            if (isExactMatch && collection) {
                              // User selected from dropdown: resolve immediately
                              handleCSVCollectionConfig(
                                fileIndex,
                                selectedContainerType,
                                collection.id,
                                name,
                                collection.locationId,
                                collectionType,
                                file.sheetName || null
                              )
                            } else {
                              // Typing: debounce to avoid lookup on every keystroke
                              debounceTimerRef.current = setTimeout(() => {
                                const c = getCollectionFromMaps(nameToLookup, collectionType)
                                if (c) {
                                  handleCSVCollectionConfig(
                                    fileIndex,
                                    selectedContainerType,
                                    c.id,
                                    name,
                                    c.locationId,
                                    collectionType,
                                    file.sheetName || null
                                  )
                                } else {
                                  handleCSVCollectionConfig(
                                    fileIndex,
                                    selectedContainerType,
                                    null,
                                    name,
                                    file.collectionLocationId || null,
                                    collectionType,
                                    file.sheetName || null
                                  )
                                }
                              }, 500)
                            }
                          }
                        }}
                        options={
                          collectionNamesByType[
                            (file.collectionType || collectionType) as
                              | 'box'
                              | 'bag'
                              | 'micronix_plate'
                              | 'cryovial_box'
                          ]
                        }
                        placeholder="Type to search or enter name"
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
                        disabled={!!file.collectionId}
                      />
                      {file.collectionId && (
                        <p className="text-xs text-gray-500 mt-1">
                          Location from existing{' '}
                          {file.collectionType === 'bag'
                            ? 'bag'
                            : file.collectionType === 'box'
                              ? 'box'
                              : file.collectionType === 'micronix_plate'
                                ? 'plate'
                                : 'cryovial box'}
                        </p>
                      )}
                    </div>

                  </div>
                </>
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

