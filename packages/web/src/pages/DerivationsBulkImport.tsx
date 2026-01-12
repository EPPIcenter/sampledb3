import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  derivationsApi, 
  specimenTypesApi, 
  unitsApi,
  type BulkDerivationSettings,
  type ValidationResult,
  type DerivationCsvImportResultRow,
  type SpecimenType,
  type Unit,
} from '../lib/api'
import { generateDerivationsTemplate, type TemplateOptions } from '../lib/template-generator'

const DERIVATION_TYPES = [
  { value: 'dna_extraction', label: 'DNA Extraction' },
  { value: 'dilution', label: 'Dilution' },
  { value: 'aliquot', label: 'Aliquot' },
  { value: 'other', label: 'Other' },
]

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
]

const SOURCE_TYPES = [
  { value: 'control_batch', label: 'Control Batch (e.g., DBS spots, control cryovials)' },
  { value: 'study_subject', label: 'Study Subject (e.g., participant specimens)' },
]

type Step = 1 | 2
type SourceType = 'control_batch' | 'study_subject'
type ParentContainerType = 'paper' | 'cryovial_tube' | 'micronix_tube'

export default function DerivationsBulkImport() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Step 1: Settings
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [allowedContainerTypes, setAllowedContainerTypes] = useState<string[]>([])
  const [sourceType, setSourceType] = useState<SourceType>('control_batch')
  const [parentContainerType, setParentContainerType] = useState<ParentContainerType>('paper')
  const [settings, setSettings] = useState<BulkDerivationSettings>({
    derivationType: 'dna_extraction',
    specimenTypeName: '',
    containerType: 'micronix_tube',
    protocol: '',
    derivationDate: new Date().toISOString().split('T')[0],
    reduceParentQuantity: true,
    validateSourceSpecimenType: false,
    validateParentQuantity: false,
  })

  // Step 2: CSV
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvContent, setCsvContent] = useState<string>('')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [importResults, setImportResults] = useState<DerivationCsvImportResultRow[] | null>(null)
  const [dryRun, setDryRun] = useState(true)

  useEffect(() => {
    loadReferenceData()
  }, [])

  useEffect(() => {
    if (settings.specimenTypeName) {
      fetchAllowedContainerTypes()
    } else {
      setAllowedContainerTypes([])
    }
  }, [settings.specimenTypeName])

  const loadReferenceData = async () => {
    try {
      setLoading(true)
      const [specimenTypesRes, unitsRes] = await Promise.all([
        specimenTypesApi.list(),
        unitsApi.list(),
      ])
      setSpecimenTypes(specimenTypesRes.data)
      setUnits(unitsRes.data)
    } catch (err: any) {
      console.error('Failed to load reference data:', err)
      setError(err.response?.data?.error || 'Failed to load reference data')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllowedContainerTypes = async () => {
    const selectedSpecimenType = specimenTypes.find(st => st.name === settings.specimenTypeName)
    if (!selectedSpecimenType) {
      setAllowedContainerTypes([])
      return
    }

    try {
      const response = await specimenTypesApi.getContainerTypes(selectedSpecimenType.id)
      const containerTypes = response.data.containerTypes || []
      setAllowedContainerTypes(containerTypes)

      // If current container type is not allowed, reset it
      if (settings.containerType && !containerTypes.includes(settings.containerType)) {
        setSettings(prev => ({
          ...prev,
          containerType: containerTypes.length > 0 ? (containerTypes[0] as any) : 'micronix_tube',
        }))
      }
    } catch (err: any) {
      console.error('Failed to fetch allowed container types:', err)
      setAllowedContainerTypes([])
    }
  }

  const handleStep1Next = () => {
    // Validate required fields
    if (!settings.derivationType) {
      setError('Derivation type is required')
      return
    }
    if (!settings.specimenTypeName) {
      setError('Specimen type is required')
      return
    }
    if (!settings.containerType) {
      setError('Container type is required')
      return
    }
    if (!settings.protocol) {
      setError('Protocol is required')
      return
    }
    if (!settings.derivationDate) {
      setError('Derivation date is required')
      return
    }

    setError(null)
    setCurrentStep(2)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvContent(text)
      setError(null)
      setValidationResult(null)
      setImportResults(null)
      // Auto-validate on file load
      if (text.trim()) {
        validateCsv(text)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(file)
  }

  const validateCsv = async (csv?: string) => {
    const content = csv || csvContent
    if (!content.trim()) {
      setError('Please upload a CSV file')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await derivationsApi.validateCsv(content, settings)
      setValidationResult(result.data)
    } catch (err: any) {
      console.error('Failed to validate CSV:', err)
      setError(err.response?.data?.error || err.response?.data?.details || 'Failed to validate CSV')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!csvContent.trim()) {
      setError('Please upload a CSV file')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await derivationsApi.importCsv(csvContent, {
        dryRun,
        settings,
      })
      setImportResults(response.data.rows || [])
      
      if (!dryRun) {
        setTimeout(() => {
          navigate('/derivations')
        }, 2000)
      }
    } catch (err: any) {
      console.error('Failed to import derivations:', err)
      setError(err.response?.data?.error || err.response?.data?.details || 'Failed to import derivations')
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = () => {
    // Determine parent type based on source type and parent container type
    let parentType: TemplateOptions['parentType']
    
    if (sourceType === 'control_batch') {
      if (parentContainerType === 'paper') {
        parentType = 'control_batch' // Uses parent_control_batch_name + parent_specimen_type_name
      } else if (parentContainerType === 'cryovial_tube') {
        parentType = 'control_batch' // Uses parent_control_batch_name + parent_specimen_type_name + parent_box_barcode + parent_position
      } else {
        parentType = 'control_batch' // Fallback
      }
    } else { // study_subject
      if (parentContainerType === 'paper') {
        parentType = 'study_subject' // Uses parent_study_short_code + parent_subject_name + parent_specimen_type_name
      } else if (parentContainerType === 'cryovial_tube') {
        parentType = 'cryovial_position' // Uses parent_box_barcode + parent_position
      } else { // micronix_tube
        parentType = 'barcode' // Uses parent_container_barcode
      }
    }
    
    const template = generateDerivationsTemplate({
      parentType,
      settings,
      sourceType,
      parentContainerType,
    })
    
    const blob = new Blob([template], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'derivations_import_template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const successCount = importResults?.filter(r => r.success).length || 0
  const errorCount = importResults?.filter(r => !r.success).length || 0
  const warningCount = importResults?.filter(r => r.warnings && r.warnings.length > 0).length || 0

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Bulk Derivation Import</h1>
        <p className="text-gray-600">
          Configure shared settings and upload a CSV to create multiple derivations at once.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="mb-6">
        <div className="flex items-center">
          <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
              1
            </div>
            <span className="ml-2 font-medium">Configure Settings</span>
          </div>
          <div className={`flex-1 h-1 mx-4 ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
              2
            </div>
            <span className="ml-2 font-medium">Upload CSV</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Configure Settings */}
      {currentStep === 1 && (
        <div className="bg-white rounded-lg border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Step 1: Configure Shared Settings</h2>
          
          <div className="space-y-4">
            {/* Source Type */}
            <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Source Configuration</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={sourceType}
                    onChange={(e) => {
                      const newSourceType = e.target.value as SourceType
                      setSourceType(newSourceType)
                      // Reset parent container type based on source type
                      if (newSourceType === 'control_batch') {
                        setParentContainerType('paper')
                      } else {
                        setParentContainerType('paper')
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                  >
                    {SOURCE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    {sourceType === 'control_batch' 
                      ? 'Extracting from control batch specimens (e.g., DBS spots, control cryovials)'
                      : 'Extracting from study subject specimens (e.g., participant samples)'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parent Container Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={parentContainerType}
                    onChange={(e) => setParentContainerType(e.target.value as ParentContainerType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                  >
                    {sourceType === 'control_batch' ? (
                      <>
                        <option value="paper">Paper (DBS spots)</option>
                        <option value="cryovial_tube">Cryovial Tube</option>
                      </>
                    ) : (
                      <>
                        <option value="paper">Paper (DBS spots)</option>
                        <option value="micronix_tube">Micronix Tube</option>
                        <option value="cryovial_tube">Cryovial Tube</option>
                      </>
                    )}
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    The type of container you're extracting FROM (the parent container)
                  </p>
                </div>
              </div>
            </div>

            {/* Derivation Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Derivation Type <span className="text-red-500">*</span>
              </label>
              <select
                value={settings.derivationType}
                onChange={(e) => setSettings({ ...settings, derivationType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              >
                {DERIVATION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Specimen Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Derived Specimen Type <span className="text-red-500">*</span>
              </label>
              <select
                value={settings.specimenTypeName}
                onChange={(e) => setSettings({ ...settings, specimenTypeName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              >
                <option value="">Select specimen type...</option>
                {specimenTypes.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Container Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Derived Container Type <span className="text-red-500">*</span>
              </label>
              <select
                value={settings.containerType}
                onChange={(e) => setSettings({ ...settings, containerType: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              >
                {(allowedContainerTypes.length > 0 
                  ? CONTAINER_TYPES.filter(type => allowedContainerTypes.includes(type.value)) 
                  : CONTAINER_TYPES
                ).map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {allowedContainerTypes.length > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  Allowed container types for this specimen type: {allowedContainerTypes.map(ct => CONTAINER_TYPES.find(t => t.value === ct)?.label || ct).join(', ')}
                </div>
              )}
            </div>

            {/* Protocol */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Protocol <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={settings.protocol}
                onChange={(e) => setSettings({ ...settings, protocol: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Protocol name or reference"
                disabled={loading}
              />
            </div>

            {/* Derivation Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Derivation Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={settings.derivationDate}
                onChange={(e) => setSettings({ ...settings, derivationDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            {/* Quantity and Unit (Optional Defaults) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Quantity (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.quantity ?? ''}
                  onChange={(e) => setSettings({ ...settings, quantity: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Can override in CSV"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Unit (Optional)
                </label>
                <select
                  value={settings.unitSymbol || ''}
                  onChange={(e) => setSettings({ ...settings, unitSymbol: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                >
                  <option value="">Auto (default for container type)</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.symbol}>
                      {unit.symbol} ({unit.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quantity Used (Optional Default) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Quantity Used from Parent (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={settings.quantityUsed ?? ''}
                onChange={(e) => setSettings({ ...settings, quantityUsed: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Can override in CSV"
                disabled={loading}
              />
            </div>

            {/* Reduce Parent Quantity */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="reduceParent"
                checked={settings.reduceParentQuantity ?? true}
                onChange={(e) => setSettings({ ...settings, reduceParentQuantity: e.target.checked })}
                className="mr-2"
                disabled={loading}
              />
              <label htmlFor="reduceParent" className="text-sm font-medium text-gray-700">
                Default: Reduce parent container quantity (can override in CSV)
              </label>
            </div>

            {/* Validation Options */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Validation Options</h3>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.validateSourceSpecimenType || false}
                    onChange={(e) => setSettings({ ...settings, validateSourceSpecimenType: e.target.checked })}
                    className="mr-2"
                    disabled={loading}
                  />
                  <span className="text-sm text-gray-700">Validate all source specimen types match</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.validateParentQuantity || false}
                    onChange={(e) => setSettings({ ...settings, validateParentQuantity: e.target.checked })}
                    className="mr-2"
                    disabled={loading}
                  />
                  <span className="text-sm text-gray-700">Validate parent quantities are sufficient</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => navigate('/derivations')}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStep1Next}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                Next: Upload CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Upload CSV */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-100 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Step 2: Upload CSV</h2>
            
            <div className="mb-4">
              <button
                onClick={downloadTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                disabled={loading}
              >
                Download CSV Template
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Template will be generated based on your settings. Required fields (derivation type, specimen type, container type, protocol, date) are set in Step 1 and not included in CSV.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CSV File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={loading}
              />
              {csvContent && (
                <div className="mt-2 text-sm text-green-600">
                  ✓ File loaded ({csvContent.split('\n').length - 1} rows)
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 mb-4">
              <button
                type="button"
                onClick={() => validateCsv()}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || !csvContent}
              >
                {loading ? 'Validating...' : 'Validate CSV'}
              </button>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="mr-2"
                  disabled={loading}
                />
                <span className="text-sm text-gray-700">Dry run (validate only, don't create derivations)</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={loading}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || !csvContent}
              >
                {loading ? (dryRun ? 'Validating...' : 'Importing...') : (dryRun ? 'Validate Only' : 'Import Derivations')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/derivations')}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Validation Results */}
          {validationResult && (
            <div className="bg-white rounded-lg border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Validation Results</h3>
              
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <div className="text-sm text-green-700 font-medium">Valid</div>
                  <div className="text-2xl font-bold text-green-900">{validationResult.summary.valid}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="text-sm text-red-700 font-medium">Invalid</div>
                  <div className="text-2xl font-bold text-red-900">{validationResult.summary.invalid}</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <div className="text-sm text-yellow-700 font-medium">Warnings</div>
                  <div className="text-2xl font-bold text-yellow-900">{validationResult.summary.warnings}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <div className="text-sm text-blue-700 font-medium">Total</div>
                  <div className="text-2xl font-bold text-blue-900">{validationResult.summary.total}</div>
                </div>
              </div>

              {/* Collections Summary */}
              {validationResult.collections.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Collections</h4>
                  <div className="space-y-1">
                    {validationResult.collections.map((col, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium">{col.name || col.barcode || 'Unnamed'}</span>
                        <span className={`ml-2 px-2 py-1 rounded text-xs ${
                          col.status === 'existing' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {col.status === 'existing' ? 'Existing' : 'Will be created'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All-or-nothing indicator */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
                <strong>All-or-nothing import:</strong> All derivations will be created, or none will be created if any row fails.
              </div>

              {/* Validation Table */}
              <div className="max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Collection</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {validationResult.rows.map((row) => (
                      <tr key={row.index} className={row.valid ? 'bg-green-50' : 'bg-red-50'}>
                        <td className="px-3 py-2 text-sm text-gray-900">{row.index + 1}</td>
                        <td className="px-3 py-2 text-sm">
                          {row.valid ? (
                            <span className="text-green-700 font-medium">✓ Valid</span>
                          ) : (
                            <span className="text-red-700 font-medium">✗ Invalid</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {row.collectionStatus && (
                            <span className={`px-2 py-1 rounded text-xs ${
                              row.collectionStatus === 'existing' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {row.collectionStatus === 'existing' ? 'Existing' : 'Will be created'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {row.error && (
                            <div className="text-red-700">{row.error}</div>
                          )}
                          {row.warnings && row.warnings.length > 0 && (
                            <div className="text-yellow-700">
                              <div className="font-medium">Warnings:</div>
                              <ul className="list-disc list-inside">
                                {row.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {row.valid && !row.error && (
                            <div className="text-green-700">Ready to import</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Results */}
          {importResults && (
            <div className="bg-white rounded-lg border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Import Results {dryRun && '(Dry Run)'}
              </h3>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <div className="text-sm text-green-700 font-medium">Successful</div>
                  <div className="text-2xl font-bold text-green-900">{successCount}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="text-sm text-red-700 font-medium">Errors</div>
                  <div className="text-2xl font-bold text-red-900">{errorCount}</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <div className="text-sm text-yellow-700 font-medium">Warnings</div>
                  <div className="text-2xl font-bold text-yellow-900">{warningCount}</div>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {importResults.map((row, idx) => (
                      <tr key={idx} className={row.success ? 'bg-green-50' : 'bg-red-50'}>
                        <td className="px-3 py-2 text-sm text-gray-900">{row.index + 1}</td>
                        <td className="px-3 py-2 text-sm">
                          {row.success ? (
                            <span className="text-green-700 font-medium">✓ Success</span>
                          ) : (
                            <span className="text-red-700 font-medium">✗ Error</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {row.error && (
                            <div className="text-red-700">{row.error}</div>
                          )}
                          {row.warnings && row.warnings.length > 0 && (
                            <div className="text-yellow-700">
                              <div className="font-medium">Warnings:</div>
                              <ul className="list-disc list-inside">
                                {row.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {row.success && !row.error && (
                            <div className="text-green-700">
                              Derivation ID: {row.derivationId}, Child Container: {row.childContainerId}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

