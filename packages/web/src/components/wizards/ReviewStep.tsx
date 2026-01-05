import { useState } from 'react'
import { controlsApi } from '../../lib/api'
import { normalizePosition } from '../../lib/control-batch-csv'
import type { BatchInfo, SpecimenTypeConfig, CSVFileData } from '../../pages/ControlBatchWizard'

interface ReviewStepProps {
  batchInfo: BatchInfo
  specimenTypes: SpecimenTypeConfig[]
  csvFiles: CSVFileData[]
  onBack: () => void
  onCancel: () => void
  onSuccess: (batchId: number) => void
  isAddMode: boolean
  existingBatchId?: number
}

export default function ReviewStep({
  batchInfo,
  specimenTypes,
  csvFiles,
  onBack,
  onCancel,
  onSuccess,
  isAddMode,
  existingBatchId,
}: ReviewStepProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!batchInfo.controlDefinitionId) {
      setError('Control definition is required')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // Build request payload - group by specimen type across ALL sources
      // Use a Map to group containers by specimen type name
      const specimensMap = new Map<string, Array<{
        type: 'paper' | 'cryovial_tube' | 'micronix_tube'
        collectionId?: number
        collectionName?: string
        collectionLocationId?: number
        collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
        containerBarcode?: string
        position?: string
        quantity?: number
        unitSymbol?: string
        sheetName?: string
      }>>()

      // Add manual specimen types
      for (const st of specimenTypes) {
        if (st.containers.length === 0) continue

        const containers = st.containers.map(c => ({
          type: st.containerType,
          collectionName: c.collectionName,
          collectionLocationId: c.collectionLocationId,
          collectionType: c.collectionType,
          containerBarcode: c.barcode,
          position: c.position ? normalizePosition(c.position) : undefined,
          quantity: c.quantity,
          unitSymbol: c.unitSymbol,
          sheetName: c.sheetName,
        }))

        // Group by specimen type name
        if (!specimensMap.has(st.specimenTypeName)) {
          specimensMap.set(st.specimenTypeName, [])
        }
        specimensMap.get(st.specimenTypeName)!.push(...containers)
      }

      // Add CSV files - group by specimen type across all files
      for (const file of csvFiles) {
        if (!file.collectionId && !file.collectionName) continue

        // Process all rows from this file
        for (const row of file.rows) {
          if (!row.specimen_type_name) continue

          const container = {
            type: file.containerType!,
            collectionId: file.collectionId,
            collectionName: file.collectionName,
            collectionLocationId: file.collectionLocationId,
            collectionType: file.collectionType,
            containerBarcode: row.barcode,
            position: row.position ? normalizePosition(row.position) : undefined,
            quantity: row.quantity || 1,
            unitSymbol: row.unit_symbol || (file.containerType === 'paper' ? 'spots' : 'µL'),
            sheetName: file.sheetName,
          }

          // Group by specimen type name
          if (!specimensMap.has(row.specimen_type_name)) {
            specimensMap.set(row.specimen_type_name, [])
          }
          specimensMap.get(row.specimen_type_name)!.push(container)
        }
      }

      // Convert map to array format
      const specimens = Array.from(specimensMap.entries()).map(([specimenTypeName, containers]) => ({
        specimenTypeName,
        containers,
      }))

      if (specimens.length === 0) {
        setError('No specimens to create')
        setSubmitting(false)
        return
      }

      // Build collections to create
      const createCollections: Array<{
        type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
        name: string
        locationId: number
        barcode?: string
      }> = []

      // Collect unique collections from manual entries
      const manualCollections = new Map<string, { name: string; locationId: number; type: string }>()
      for (const st of specimenTypes) {
        for (const c of st.containers) {
          if (c.collectionName && c.collectionLocationId && !c.collectionId) {
            const key = `${c.collectionName}-${c.collectionLocationId}`
            if (!manualCollections.has(key)) {
              let collectionType: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
              if (st.containerType === 'paper') {
                collectionType = c.collectionType || 'box'
              } else if (st.containerType === 'cryovial_tube') {
                collectionType = 'cryovial_box'
              } else {
                collectionType = 'micronix_plate'
              }
              manualCollections.set(key, {
                name: c.collectionName,
                locationId: c.collectionLocationId,
                type: collectionType,
              })
            }
          }
        }
      }

      for (const coll of manualCollections.values()) {
        createCollections.push({
          type: coll.type as any,
          name: coll.name,
          locationId: coll.locationId,
        })
      }

      // Add CSV collections
      for (const file of csvFiles) {
        if (file.collectionName && file.collectionLocationId && !file.collectionId) {
          createCollections.push({
            type: file.collectionType || (file.containerType === 'paper' ? 'box' : 
                  file.containerType === 'cryovial_tube' ? 'cryovial_box' : 
                  'micronix_plate'),
            name: file.collectionName,
            locationId: file.collectionLocationId,
          })
        }
      }

      if (isAddMode && existingBatchId) {
        // Add specimens to existing batch
        const response = await controlsApi.addSpecimensToBatch(existingBatchId, {
          specimens,
          createCollections,
        })
        onSuccess(existingBatchId)
      } else {
        // Create new batch with specimens
        const response = await controlsApi.createBatchWithSpecimens({
          batch: {
            controlDefinitionId: batchInfo.controlDefinitionId,
            name: batchInfo.name,
            productionDate: batchInfo.productionDate || undefined,
            properties: batchInfo.properties,
          },
          specimens,
          createCollections,
        })
        
        // Extract batch ID from response
        const batchId = response.data?.batch?.id
        if (!batchId || isNaN(batchId)) {
          console.error('Invalid batch ID in response:', response.data)
          throw new Error(`Failed to create batch: invalid batch ID returned (${batchId})`)
        }
        
        onSuccess(batchId)
      }
    } catch (err: any) {
      console.error('Failed to create batch:', err)
      setError(err.response?.data?.error || 'Failed to create batch and specimens')
      setSubmitting(false)
    }
  }

  const totalContainers = 
    specimenTypes.reduce((sum, st) => sum + st.containers.length, 0) +
    csvFiles.reduce((sum, f) => sum + f.rows.length, 0)

  // Count collections to create - use same logic as createCollections building
  const collectionsToCreateSet = new Set<string>()
  // Collect unique collections from manual entries (same logic as in handleSubmit)
  for (const st of specimenTypes) {
    for (const c of st.containers) {
      if (c.collectionName && c.collectionLocationId && !c.collectionId) {
        // Use same key format as createCollections to ensure consistency
        const key = `${c.collectionName}-${c.collectionLocationId}`
        collectionsToCreateSet.add(key)
      }
    }
  }
  // Add CSV collections
  for (const file of csvFiles) {
    if (file.collectionName && file.collectionLocationId && !file.collectionId) {
      const key = `${file.collectionName}-${file.collectionLocationId}`
      collectionsToCreateSet.add(key)
    }
  }
  const collectionsToCreate = collectionsToCreateSet

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Review & Confirm</h2>
        <p className="text-sm text-gray-600 mb-6">
          Review the batch information and specimen configuration before creating.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Batch Info Summary */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-3">Batch Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Control Definition:</span>
            <span className="ml-2 font-medium text-gray-900">
              {batchInfo.controlDefinition?.name || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Batch Name:</span>
            <span className="ml-2 font-medium text-gray-900">{batchInfo.name}</span>
          </div>
          <div>
            <span className="text-gray-600">Production Date:</span>
            <span className="ml-2 font-medium text-gray-900">
              {batchInfo.productionDate || 'Not set'}
            </span>
          </div>
        </div>
      </div>

      {/* Specimen Types Summary */}
      {specimenTypes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Specimen Types ({specimenTypes.length})</h3>
          <div className="space-y-2">
            {specimenTypes.map((st) => (
              <div key={st.id} className="text-sm">
                <span className="font-medium text-gray-900">{st.specimenTypeName}</span>
                <span className="text-gray-600 ml-2">
                  - {st.containers.length} containers ({st.containerType})
                  {st.containerType === 'paper' && st.containers.some(c => c.sheetName) && (
                    <span className="ml-1">
                      - Sheets: {Array.from(new Set(st.containers.map(c => c.sheetName).filter(Boolean))).join(', ')}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSV Files Summary */}
      {csvFiles.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">CSV Files ({csvFiles.length})</h3>
          <div className="space-y-2">
            {csvFiles.map((file, index) => (
              <div key={index} className="text-sm">
                <span className="font-medium text-gray-900">{file.filename}</span>
                <span className="text-gray-600 ml-2">
                  - {file.rows.length} containers
                  {file.collectionName && ` → ${file.collectionName}`}
                  {file.containerType === 'paper' && file.sheetName && ` (Sheet: ${file.sheetName})`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-3">Summary</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-blue-700">Total Specimen Types:</span>
            <span className="ml-2 font-bold text-blue-900">
              {new Set([
                ...specimenTypes.map(st => st.specimenTypeName),
                ...csvFiles.flatMap(f => 
                  Array.from(new Set(f.rows.map(r => r.specimen_type_name)))
                )
              ]).size}
            </span>
          </div>
          <div>
            <span className="text-blue-700">Total Containers:</span>
            <span className="ml-2 font-bold text-blue-900">{totalContainers}</span>
          </div>
          <div>
            <span className="text-blue-700">Collections to Create:</span>
            <span className="ml-2 font-bold text-blue-900">{collectionsToCreate.size}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          disabled={submitting}
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : isAddMode ? 'Add Specimens' : 'Create Batch'}
        </button>
      </div>
    </div>
  )
}

