import { useState, useEffect, useRef, useMemo } from 'react'
import SheetCard from './SheetCard'
import CollectionAssignment from './CollectionAssignment'
import type { CollectionAssignmentChange } from './CollectionAssignment'
import type { CollectionOption } from '../CollectionSelectOrCreate'
import { collectionsApi } from '../../lib/api/collections';
import { settingsApi } from '../../lib/api/settings';
import type { Unit } from '../../lib/api/types';
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
  /** Collection options by type (id, name, locationPath) for unified select/create. */
  const [collectionOptionsByType, setCollectionOptionsByType] = useState<{
    box: CollectionOption[]
    bag: CollectionOption[]
    micronix_plate: CollectionOption[]
    cryovial_box: CollectionOption[]
  }>({ box: [], bag: [], micronix_plate: [], cryovial_box: [] })
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [unitsByContainerType, setUnitsByContainerType] = useState<Record<string, Unit[]>>({})
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const existingCollectionsRef = useRef(existingCollections)
  existingCollectionsRef.current = existingCollections

  // Load allowed units for each container type present in specimen types (manual entry)
  const containerTypesInUse = useMemo(
    () => Array.from(new Set(specimenTypes.map((st) => st.containerType))),
    [specimenTypes]
  )
  useEffect(() => {
    const typesToLoad = containerTypesInUse.filter((ct) => {
      const units = unitsByContainerType[ct]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- units undefined until fetch completes
      return !units || units.length === 0
    })
    if (typesToLoad.length === 0) return
    let cancelled = false
    const load = async () => {
      const results = await Promise.allSettled(
        typesToLoad.map(async (ct) => {
          const res = await settingsApi.getContainerTypeUnits(ct)
          return { ct, units: res.data.units } as const
        })
      )
      if (cancelled) return
      setUnitsByContainerType((prev) => {
        const next = { ...prev }
        for (const r of results) {
          if (r.status === 'fulfilled') {
            next[r.value.ct] = r.value.units
          }
        }
        return next
      })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [containerTypesInUse, unitsByContainerType])

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
        const boxOptions: CollectionOption[] = []
        boxesRes.data.collections.forEach((box: { id: number; name?: string; locationId?: number | null; location?: { path: string | null } | null }) => {
          if (box.name) {
            if (box.locationId != null) {
              boxesMap.set(box.name, { id: box.id, locationId: box.locationId })
            }
            boxOptions.push({ id: box.id, name: box.name, locationPath: box.location?.path ?? null })
          }
        })

        const bagsMap = new Map<string, { id: number; locationId: number }>()
        const bagOptions: CollectionOption[] = []
        bagsRes.data.collections.forEach((bag: { id: number; name?: string; locationId?: number | null; location?: { path: string | null } | null }) => {
          if (bag.name) {
            if (bag.locationId != null) {
              bagsMap.set(bag.name, { id: bag.id, locationId: bag.locationId })
            }
            bagOptions.push({ id: bag.id, name: bag.name, locationPath: bag.location?.path ?? null })
          }
        })

        const platesMap = new Map<string, { id: number; locationId: number }>()
        const plateOptions: CollectionOption[] = []
        platesRes.data.collections.forEach((p: { id: number; name?: string; locationId?: number | null; location?: { path: string | null } | null }) => {
          if (p.name) {
            if (p.locationId != null) {
              platesMap.set(p.name, { id: p.id, locationId: p.locationId })
            }
            plateOptions.push({ id: p.id, name: p.name, locationPath: p.location?.path ?? null })
          }
        })
        const cryovialMap = new Map<string, { id: number; locationId: number }>()
        const cryovialOptions: CollectionOption[] = []
        cryovialRes.data.collections.forEach((c: { id: number; name?: string; locationId?: number | null; location?: { path: string | null } | null }) => {
          if (c.name) {
            if (c.locationId != null) {
              cryovialMap.set(c.name, { id: c.id, locationId: c.locationId })
            }
            cryovialOptions.push({ id: c.id, name: c.name, locationPath: c.location?.path ?? null })
          }
        })

        setExistingCollections({ boxes: boxesMap, bags: bagsMap, micronix_plate: platesMap, cryovial_box: cryovialMap })
        setCollectionOptionsByType({
          box: boxOptions.sort((a, b) => a.name.localeCompare(b.name)),
          bag: bagOptions.sort((a, b) => a.name.localeCompare(b.name)),
          micronix_plate: plateOptions.sort((a, b) => a.name.localeCompare(b.name)),
          cryovial_box: cryovialOptions.sort((a, b) => a.name.localeCompare(b.name)),
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

  const defaultUnitForContainerType = (containerType: string): string => {
    const units = unitsByContainerType[containerType]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- units undefined until fetch completes
    if (units && units.length) return units[0]!.symbol
    return containerType === 'paper' ? 'spots' : 'µL'
  }

  const addContainerToSpecimenType = (specimenTypeId: string) => {
    const updated = specimenTypes.map(st => {
      if (st.id === specimenTypeId) {
        const newContainer: ContainerConfig = {
          id: `c-${Date.now()}-${Math.random()}`,
          quantity: 1,
          unitSymbol: defaultUnitForContainerType(st.containerType),
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
          unitSymbol: defaultUnitForContainerType('paper'),
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
          unitSymbol: defaultUnitForContainerType('paper'),
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
        const hasSheetNames = !!f.sheetName?.trim() || (f.rows?.length > 0 && f.rows.every(r => !!(r.sheet_name?.trim()))) // eslint-disable-line @typescript-eslint/no-unnecessary-condition
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
        <p className="text-sm mb-6" style={{ color: 'rgb(var(--app-text-muted))' }}>
          Configure containers for each specimen type and assign collections for CSV files.
        </p>
      </div>

      {/* Tabs */}
      {(specimenTypes.length > 0 && csvFiles.length > 0) && (
        <div className="border-b" style={{ borderColor: 'rgb(var(--app-border))' }}>
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
              style={{ borderColor: 'rgb(var(--app-border))' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
                    {st.specimenTypeName}
                  </h3>
                  <p className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>
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
                            if (updates.collectionId !== undefined) {
                              containers.forEach((c) =>
                                updateContainer(st.id, c.id, {
                                  collectionId: updates.collectionId,
                                  collectionName: updates.collectionName,
                                })
                              )
                            }
                            if (updates.collectionName !== undefined && updates.collectionId === undefined) {
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
                          collectionOptions={{
                            box: collectionOptionsByType.box,
                            bag: collectionOptionsByType.bag,
                          }}
                          allowedUnits={unitsByContainerType['paper'] ?? []}
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
                          style={{ backgroundColor: 'rgb(var(--app-surface))' }}
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
                            className="px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
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
                            className="px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
                          />
                          <input
                            type="number"
                            placeholder="Quantity"
                            value={container.quantity ?? ''} // eslint-disable-line @typescript-eslint/no-unnecessary-condition
                            onChange={(e) =>
                              updateContainer(st.id, container.id, {
                                quantity: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
                          />
                          {(() => {
                            const tubeUnits = unitsByContainerType[st.containerType]
                            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tubeUnits undefined until fetch completes
                            return tubeUnits && tubeUnits.length ? (
                            <select
                              aria-label="Unit"
                              value={
                                container.unitSymbol &&
                                tubeUnits.some((u) => u.symbol === container.unitSymbol)
                                  ? container.unitSymbol
                                  : tubeUnits[0]!.symbol
                              }
                              onChange={(e) =>
                                updateContainer(st.id, container.id, {
                                  unitSymbol: e.target.value,
                                })
                              }
                              className="px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
                            >
                              {tubeUnits.map((u) => (
                                <option key={u.id} value={u.symbol}>
                                  {u.symbol}
                                  {u.name ? ` (${u.name})` : ''}
                                </option>
                              ))}
                            </select>
                            ) : (
                            <input
                              type="text"
                              placeholder="Unit"
                              value={container.unitSymbol || ''}
                              onChange={(e) =>
                                updateContainer(st.id, container.id, {
                                  unitSymbol: e.target.value,
                                })
                              }
                              className="px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
                            />
                            ); })()}
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
                    <div className="pt-4 border-t" style={{ borderColor: 'rgb(var(--app-border))' }}>
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
                          if (updates.collectionId !== undefined) {
                            st.containers.forEach((c) =>
                              updateContainer(st.id, c.id, {
                                collectionId: updates.collectionId,
                                collectionName: updates.collectionName,
                              })
                            )
                          }
                          if (updates.collectionName !== undefined && updates.collectionId === undefined) {
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
                        collectionOptions={
                          collectionOptionsByType[
                            (st.containers[0]?.collectionType ||
                              getCollectionType(st.containerType)) as
                              | 'box'
                              | 'bag'
                              | 'micronix_plate'
                              | 'cryovial_box'
                          ]
                        }
                        allowCreateCollection
                      />
                    </div>
                  </div>
                )
              ) : (
                <p
                  className="text-sm italic"
                  style={{ color: 'rgb(var(--app-text-muted))' }}
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
                style={{ borderColor: 'rgb(var(--app-border))' }}
              >
                <div className="mb-4">
                  <h3 className="font-semibold text-app-text">{file.filename}</h3>
                  <p className="text-sm text-app-text-muted">
                    {file.rows.length} containers, {new Set(file.rows.map(r => r.specimen_type_name)).size} specimen type(s)
                  </p>
                </div>

                {cannotInferContainerType ? (
                  <div className="mb-4 p-3 rounded-lg bg-app-trend-down/10 border border-app-trend-down" role="alert">
                    <p className="text-sm text-app-trend-down font-medium">Container type could not be inferred from this CSV.</p>
                    <p className="text-sm text-app-trend-down mt-1">
                      Re-upload using a template with <code className="px-1 py-0.5 rounded bg-app-trend-down/20">sheet_name</code> (DBS) or <code className="px-1 py-0.5 rounded bg-app-trend-down/20">position</code> (tubes). Remove this file and upload again from the previous step.
                    </p>
                  </div>
                ) : (
                <>
                {/* Container type: read-only when paper inferred; dropdown (Cryovial/Micronix only) when tube template */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Container Type *
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {file.containerTypeInferred ? (
                      <>
                        <span className="block px-3 py-2 border border-app-border rounded-lg text-sm bg-app-surface text-app-text">
                          DBS Sheet (Paper)
                        </span>
                        <span className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>
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
                          className="block px-3 py-2 border border-app-border rounded-lg text-sm"
                        >
                          <option value="cryovial_tube">Cryovial</option>
                          <option value="micronix_tube">Micronix Tube</option>
                        </select>
                        <span className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>
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
                        <p className="text-sm text-app-text">
                          Sheet name: <strong>{file.sheetName || names[0]}</strong> <span className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>(from CSV)</span>
                        </p>
                      </div>
                    )
                  }
                  if (names.length > 1) {
                    return (
                      <div className="mb-4">
                        <p className="text-sm text-app-text">
                          Sheet names from CSV: <strong>{names.join(', ')}</strong>
                        </p>
                      </div>
                    )
                  }
                  return (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-app-text mb-2">
                        Sheet name (if one sheet for whole file)
                      </label>
                      <p className="text-xs mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
                        Add a <code className="px-1 py-0.5 rounded bg-app-surface">sheet_name</code> column to your CSV to put papers on multiple sheets, or enter one name below. All sheets go into the collection (box/bag) below.
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
                        className="block w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-card text-app-text"
                      />
                    </div>
                  )
                })()}

                {/* Collection assignment */}
                {needsBoxOrBag && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-app-text mb-2">
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
                      className="block w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-card text-app-text"
                    >
                      <option value="box">Box</option>
                      <option value="bag">Bag</option>
                    </select>
                  </div>
                )}

                {file.collectionId && file.collectionName && (
                  <div className="flex items-center justify-between gap-2 bg-app-trend-up/10 border border-app-trend-up/30 rounded p-3 mb-2">
                    <p className="text-sm text-app-trend-up">
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
                      className="text-sm text-app-trend-up underline hover:no-underline shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div className="space-y-4">
                  <CollectionAssignment
                    containerType={selectedContainerType}
                    collectionType={(file.collectionType || collectionType) as 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'}
                    collectionName={file.collectionName || ''}
                    collectionLocationId={file.collectionLocationId ?? null}
                    collectionId={file.collectionId}
                    onChange={(updates) => {
                      const ct = (file.collectionType || collectionType) as 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
                      // When CollectionAssignment clears it sends { collectionName: '', collectionLocationId: null, collectionId: undefined }.
                      // Both collectionName and collectionLocationId branches run; the second must not overwrite the clear with old file values.
                      const isClear =
                        updates.collectionName === '' &&
                        updates.collectionLocationId === null &&
                        updates.collectionId === undefined

                      if (updates.collectionId !== undefined) {
                        handleCSVCollectionConfig(
                          fileIndex,
                          selectedContainerType,
                          updates.collectionId ?? null,
                          updates.collectionName ?? null,
                          file.collectionLocationId ?? null,
                          ct,
                          file.sheetName || null
                        )
                      }
                      if (updates.collectionName !== undefined && updates.collectionId === undefined) {
                        if (updates.collectionName.trim()) {
                          const nameToLookup = updates.collectionName.trim()
                          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
                          debounceTimerRef.current = setTimeout(() => {
                            const c = getCollectionFromMaps(nameToLookup, ct)
                            handleCSVCollectionConfig(
                              fileIndex,
                              selectedContainerType,
                              c?.id ?? null,
                              updates.collectionName ?? null,
                              c?.locationId ?? file.collectionLocationId ?? null,
                              ct,
                              file.sheetName || null
                            )
                          }, 500)
                        } else {
                          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
                          handleCSVCollectionConfig(
                            fileIndex,
                            selectedContainerType,
                            null,
                            updates.collectionName ?? '',
                            null,
                            ct,
                            file.sheetName || null
                          )
                        }
                      }
                      if (updates.collectionLocationId !== undefined) {
                        handleCSVCollectionConfig(
                          fileIndex,
                          selectedContainerType,
                          isClear ? null : (file.collectionId ?? null),
                          isClear ? '' : (file.collectionName ?? null),
                          updates.collectionLocationId,
                          ct,
                          file.sheetName || null
                        )
                      }
                      if (updates.collectionType !== undefined) {
                        handleCSVCollectionConfig(
                          fileIndex,
                          selectedContainerType,
                          file.collectionId ?? null,
                          file.collectionName ?? null,
                          file.collectionLocationId ?? null,
                          updates.collectionType,
                          file.sheetName || null
                        )
                      }
                    }}
                    showCollectionTypeSelector={needsBoxOrBag}
                    successMessageVariant="collection"
                    collectionOptions={
                      collectionOptionsByType[
                        (file.collectionType || collectionType) as
                          | 'box'
                          | 'bag'
                          | 'micronix_plate'
                          | 'cryovial_box'
                      ]
                    }
                    allowCreateCollection
                  />
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
        style={{ borderColor: 'rgb(var(--app-border))' }}
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

