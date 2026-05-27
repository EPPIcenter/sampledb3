import { useState, useRef } from 'react'
import { parseContainerCSV, validateCSVRows, generateCSVTemplate, inferSheetName } from '../../lib/control-batch-csv'
import { specimenTypesApi } from '../../lib/api/reference-data';
import type { SpecimenType } from '../../lib/api/types';
import type { CSVFileData } from '../../pages/ControlBatchWizard'

/** Minimal batch info for production date in composition CSV flow. */
export interface BatchInfoProductionDate {
  productionDate: string
}

interface CSVUploadStepProps {
  csvFiles: CSVFileData[]
  onChange: (files: CSVFileData[]) => void
  availableSpecimenTypes: SpecimenType[]
  onNext: () => void
  onBack: () => void
  /** When set (e.g. composition flow), Back button shows this label instead of "Back" */
  backLabel?: string
  onCancel: () => void
  /** When true (e.g. composition flow), show production date field; requires batchInfo and onBatchInfoChange */
  showProductionDate?: boolean
  batchInfo?: BatchInfoProductionDate
  onBatchInfoChange?: (info: BatchInfoProductionDate) => void
}

export default function CSVUploadStep({
  csvFiles,
  onChange,
  availableSpecimenTypes,
  onNext,
  onBack,
  backLabel,
  onCancel,
  showProductionDate,
  batchInfo,
  onBatchInfoChange,
}: CSVUploadStepProps) {
  const showProductionDateField =
    showProductionDate && batchInfo != null && onBatchInfoChange != null
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [selectedContainerType, setSelectedContainerType] = useState<'paper' | 'cryovial_tube' | 'micronix_tube'>('paper')
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newFiles: CSVFileData[] = []

    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const parsed = parseContainerCSV(text, file.name)
        
        // Validate rows (use inferred container type so tube formats require position)
        const validationErrors = validateCSVRows(
          parsed.rows,
          availableSpecimenTypes,
          parsed.inferredContainerType
        )

        // Container category must be inferrable from CSV header (sheet_name → paper, position → tube; user picks cryovial vs micronix for tube)
        const containerTypeErrors =
          parsed.rows.length > 0 && parsed.inferredContainerCategory == null
            ? [{ row: 0, error: 'Container type could not be inferred from CSV header. Use a template with sheet_name (DBS) or position (tubes).' }]
            : []

        const defaultCollectionName = (parsed.filename || file.name).replace(/\.csv$/i, '')
        const inferredSheetName = inferSheetName(parsed.rows)
        const isPaper = parsed.inferredContainerCategory === 'paper'
        const isTube = parsed.inferredContainerCategory === 'tube'
        newFiles.push({
          filename: parsed.filename,
          rows: parsed.rows,
          errors: [...parsed.errors, ...validationErrors, ...containerTypeErrors],
          collectionName: defaultCollectionName,
          ...(parsed.inferredContainerCategory != null && {
            containerCategoryInferred: parsed.inferredContainerCategory,
            containerType: parsed.inferredContainerType ?? (isTube ? 'cryovial_tube' : 'paper'),
            containerTypeInferred: isPaper,
          }),
          ...(inferredSheetName != null && { sheetName: inferredSheetName }),
        })
      } catch (error) {
        console.error('Error parsing CSV:', error)
        newFiles.push({
          filename: file.name,
          rows: [],
          errors: [{ row: 0, error: 'Failed to parse CSV file' }],
        })
      }
    }

    onChange([...csvFiles, ...newFiles])
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const removeFile = (index: number) => {
    onChange(csvFiles.filter((_, i) => i !== index))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const downloadTemplate = async () => {
    try {
      const response = await specimenTypesApi.getByContainerType(selectedContainerType)
      const allowedSpecimenTypes = response.specimenTypes

      if (allowedSpecimenTypes.length === 0) {
        alert(`No specimen types are configured for ${selectedContainerType}. Please configure container type relationships first.`)
        return
      }

      const template = generateCSVTemplate(selectedContainerType, allowedSpecimenTypes)
      
      const blob = new Blob([template], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `control-batch-template-${selectedContainerType}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setShowTemplateDialog(false)
    } catch (error) {
      console.error('Error generating template:', error)
      alert('Failed to generate template. Please try again.')
    }
  }

  return (
    <div className="space-y-6">
      {showProductionDateField && (
        <div>
          <label htmlFor="production-date" className="block text-sm font-medium mb-2 text-app-text">
            Production date
          </label>
          <input
            id="production-date"
            type="date"
            value={batchInfo.productionDate}
            onChange={(e) => onBatchInfoChange({ productionDate: e.target.value })}
            className="block w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-card text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent"
          />
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-app-text mb-4">Upload CSV Files</h2>
        <p className="text-sm text-app-text-muted mb-6">
          Upload CSV files where each file represents one collection (box, bag, or plate).
          Each row in the CSV represents one container within that collection.
          The default unit for the container type is used; quantity and unit can be edited in the configuration step.
        </p>
      </div>

      {/* File upload area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-app-accent bg-app-accent-muted' : 'border-app-border bg-app-card'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        <div className="space-y-4">
          <svg
            className="mx-auto h-12 w-12 text-app-text-muted"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="file-input-trigger"
            >
              Click to upload
            </button>
            <span className="text-app-text-muted"> or drag and drop</span>
          </div>
          <p className="text-xs text-app-text-muted">CSV files only (one file per collection)</p>
        </div>
      </div>

      {/* Template download */}
      <div className="flex justify-end">
        {showTemplateDialog ? (
          <div className="bg-app-card border border-app-border rounded-lg p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-app-text mb-3">Select Container Type</h3>
            <div className="space-y-2 mb-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="containerType"
                  value="paper"
                  checked={selectedContainerType === 'paper'}
                  onChange={(e) => setSelectedContainerType(e.target.value as any)}
                  className="mr-2"
                />
                <span className="text-sm">Paper (DBS Sheets)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="containerType"
                  value="cryovial_tube"
                  checked={selectedContainerType === 'cryovial_tube'}
                  onChange={(e) => setSelectedContainerType(e.target.value as any)}
                  className="mr-2"
                />
                <span className="text-sm">Cryovial Tube</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="containerType"
                  value="micronix_tube"
                  checked={selectedContainerType === 'micronix_tube'}
                  onChange={(e) => setSelectedContainerType(e.target.value as any)}
                  className="mr-2"
                />
                <span className="text-sm">Micronix Tube</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTemplateDialog(false)}
                className="px-3 py-1 text-sm border border-app-border rounded text-app-text hover:bg-app-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={downloadTemplate}
                className="px-3 py-1 text-sm bg-app-accent text-white rounded hover:bg-app-accent-hover"
              >
                Download Template
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowTemplateDialog(true)}
            className="text-sm text-app-accent hover:text-app-accent-hover"
          >
            Download CSV Template
          </button>
        )}
      </div>

      {/* Uploaded files list */}
      {csvFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-app-text mb-3">Uploaded Files</h3>
          <div className="space-y-3">
            {csvFiles.map((file, index) => (
              <div
                key={index}
                className="bg-app-card border border-app-border rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-app-text">{file.filename}</span>
                    <span className="text-sm text-app-text-muted ml-2">
                      ({file.rows.length} containers)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-app-trend-down hover:text-app-trend-down/80"
                  >
                    Remove
                  </button>
                </div>

                {file.errors.length > 0 && (
                  <div className="mt-2 bg-app-trend-down/10 border border-app-trend-down rounded p-2">
                    <p className="text-xs font-semibold text-app-trend-down mb-1">Validation Errors:</p>
                    <ul className="text-xs text-app-trend-down space-y-1">
                      {file.errors.slice(0, 5).map((error, i) => (
                        <li key={i}>
                          Row {error.row}: {error.error}
                        </li>
                      ))}
                      {file.errors.length > 5 && (
                        <li>... and {file.errors.length - 5} more errors</li>
                      )}
                    </ul>
                  </div>
                )}

                {file.errors.length === 0 && (
                  <div className="mt-2 text-xs text-app-trend-up">
                    ✓ File parsed successfully
                  </div>
                )}

                {/* Show specimen types in file */}
                {file.rows.length > 0 && (
                  <div className="mt-2 text-xs text-app-text-muted">
                    Specimen types: {Array.from(new Set(file.rows.map(r => r.specimen_type_name))).join(', ')}
                  </div>
                )}

                <p className="mt-2 text-xs text-app-text-muted">
                  Assign container type and collection in the next step (Containers).
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t">
        {/* When backLabel is "Cancel", Back is the only cancel action; avoid duplicate Cancel button */}
        {backLabel !== 'Cancel' && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
        >
          {backLabel ?? 'Back'}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={
            csvFiles.length === 0 ||
            csvFiles.some(f => f.errors.length > 0) ||
            (showProductionDateField && !batchInfo.productionDate)
          }
          className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Configure Containers
        </button>
      </div>
    </div>
  )
}

