import { useState, useRef } from 'react'
import { parseContainerCSV, validateCSVRows, type ParsedCSVFile, generateCSVTemplate } from '../../lib/control-batch-csv'
import { specimenTypesApi } from '../../lib/api'
import type { SpecimenType } from '../../lib/api'
import type { CSVFileData } from '../../pages/ControlBatchWizard'

interface CSVUploadStepProps {
  csvFiles: CSVFileData[]
  onChange: (files: CSVFileData[]) => void
  availableSpecimenTypes: SpecimenType[]
  onNext: () => void
  onBack: () => void
  onCancel: () => void
}

export default function CSVUploadStep({
  csvFiles,
  onChange,
  availableSpecimenTypes,
  onNext,
  onBack,
  onCancel,
}: CSVUploadStepProps) {
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
        
        // Validate rows
        const validationErrors = validateCSVRows(
          parsed.rows,
          availableSpecimenTypes
        )

        newFiles.push({
          filename: parsed.filename,
          rows: parsed.rows,
          errors: [...parsed.errors, ...validationErrors],
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
  }

  const downloadTemplate = async () => {
    try {
      // Get specimen types allowed for selected container type
      const response = await specimenTypesApi.getByContainerType(selectedContainerType)
      const allowedSpecimenTypes = response.data.specimenTypes || []
      
      if (allowedSpecimenTypes.length === 0) {
        alert(`No specimen types are configured for ${selectedContainerType}. Please configure container type relationships first.`)
        return
      }
      
      // Generate template with allowed specimen types
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
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload CSV Files</h2>
        <p className="text-sm text-gray-600 mb-6">
          Upload CSV files where each file represents one collection (box, bag, or plate).
          Each row in the CSV represents one container within that collection.
        </p>
      </div>

      {/* File upload area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-teal-500 bg-teal-50' : 'border-gray-300 bg-white'
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
            className="mx-auto h-12 w-12 text-gray-400"
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
            <span className="text-gray-600"> or drag and drop</span>
          </div>
          <p className="text-xs text-gray-500">CSV files only (one file per collection)</p>
        </div>
      </div>

      {/* Template download */}
      <div className="flex justify-end">
        {showTemplateDialog ? (
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Container Type</h3>
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
                className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={downloadTemplate}
                className="px-3 py-1 text-sm bg-teal-600 text-white rounded hover:bg-teal-700"
              >
                Download Template
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowTemplateDialog(true)}
            className="text-sm text-teal-600 hover:text-teal-700"
          >
            Download CSV Template
          </button>
        )}
      </div>

      {/* Uploaded files list */}
      {csvFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Uploaded Files</h3>
          <div className="space-y-3">
            {csvFiles.map((file, index) => (
              <div
                key={index}
                className="bg-white border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-gray-900">{file.filename}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({file.rows.length} containers)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>

                {file.errors.length > 0 && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded p-2">
                    <p className="text-xs font-semibold text-red-800 mb-1">Validation Errors:</p>
                    <ul className="text-xs text-red-700 space-y-1">
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
                  <div className="mt-2 text-xs text-green-700">
                    ✓ File parsed successfully
                  </div>
                )}

                {/* Show specimen types in file */}
                {file.rows.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    Specimen types: {Array.from(new Set(file.rows.map(r => r.specimen_type_name))).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
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
          disabled={csvFiles.length === 0 || csvFiles.some(f => f.errors.length > 0)}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Configure Containers
        </button>
      </div>
    </div>
  )
}

