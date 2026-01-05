import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BatchInfoStep from '../components/wizards/BatchInfoStep'
import SpecimenTypesStep from '../components/wizards/SpecimenTypesStep'
import CSVUploadStep from '../components/wizards/CSVUploadStep'
import ContainerConfigurationStep from '../components/wizards/ContainerConfigurationStep'
import ReviewStep from '../components/wizards/ReviewStep'
import { controlsApi, specimenTypesApi } from '../lib/api'
import type { ControlDefinition, SpecimenType } from '../lib/api'

export type WizardStep = 'batch-info' | 'specimen-types' | 'csv-upload' | 'containers' | 'review'

export interface BatchInfo {
  controlDefinitionId: number | null
  controlDefinition: ControlDefinition | null
  name: string
  productionDate: string
  properties?: Record<string, any>
}

export interface SpecimenTypeConfig {
  id: string
  specimenTypeId: number
  specimenTypeName: string
  containerType: 'paper' | 'cryovial_tube' | 'micronix_tube'
  containers: ContainerConfig[]
}

export interface ContainerConfig {
  id: string
  position?: string
  barcode?: string
  quantity: number
  unitSymbol: string
  collectionId?: number
  collectionName?: string
  collectionLocationId?: number
  collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  sheetName?: string
  sheetId?: string // Internal ID to track which sheet a paper belongs to
}

export interface CSVFileData {
  filename: string
  rows: Array<{
    specimen_type_name: string
    position?: string
    barcode?: string
    quantity?: number
    unit_symbol?: string
  }>
  containerType?: 'paper' | 'cryovial_tube' | 'micronix_tube'
  collectionId?: number
  collectionName?: string
  collectionLocationId?: number
  collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  sheetName?: string
  errors: Array<{ row: number; field?: string; error: string }>
}

export default function ControlBatchWizard() {
  const navigate = useNavigate()
  const { id: batchId } = useParams<{ id?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const isAddMode = !!batchId
  // In add mode, skip batch-info step and go directly to specimen-types
  const defaultStep = isAddMode ? 'specimen-types' : 'batch-info'
  const currentStep = (searchParams.get('step') as WizardStep) || defaultStep

  const [batchInfo, setBatchInfo] = useState<BatchInfo>({
    controlDefinitionId: null,
    controlDefinition: null,
    name: '',
    productionDate: new Date().toISOString().split('T')[0],
  })
  
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenTypeConfig[]>([])
  const [csvFiles, setCsvFiles] = useState<CSVFileData[]>([])
  const [availableSpecimenTypes, setAvailableSpecimenTypes] = useState<SpecimenType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSpecimenTypes()
    if (isAddMode && batchId) {
      loadExistingBatch(parseInt(batchId))
    }
  }, [batchId, isAddMode])

  const loadSpecimenTypes = async () => {
    try {
      const response = await specimenTypesApi.list()
      setAvailableSpecimenTypes(response.data.specimenTypes || [])
    } catch (err) {
      console.error('Failed to load specimen types:', err)
    }
  }

  const loadExistingBatch = async (id: number) => {
    try {
      setLoading(true)
      const response = await controlsApi.getBatch(id)
      const batch = response.data.batch
      const defResponse = await controlsApi.get(batch.controlDefinitionId)
      setBatchInfo({
        controlDefinitionId: batch.controlDefinitionId,
        controlDefinition: defResponse.data.control,
        name: batch.name,
        productionDate: batch.productionDate || new Date().toISOString().split('T')[0],
        properties: batch.properties,
      })
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load batch')
    } finally {
      setLoading(false)
    }
  }

  const setStep = (step: WizardStep) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    })
  }

  const canProceedToStep = (step: WizardStep): boolean => {
    switch (step) {
      case 'batch-info':
        return !isAddMode // Only accessible when creating new batch
      case 'specimen-types':
      case 'csv-upload':
        return isAddMode || !!batchInfo.controlDefinitionId
      case 'containers':
        return specimenTypes.length > 0 || csvFiles.length > 0
      case 'review':
        return (specimenTypes.length > 0 || csvFiles.length > 0) &&
               (specimenTypes.every(st => st.containers.length > 0) || 
                csvFiles.every(f => f.collectionId || f.collectionName))
      default:
        return false
    }
  }

  const steps: Array<{ id: WizardStep; label: string; number: number }> = [
    { id: 'batch-info', label: 'Batch Info', number: 1 },
    { id: 'specimen-types', label: 'Specimen Types', number: 2 },
    { id: 'containers', label: 'Containers', number: 3 },
    { id: 'review', label: 'Review', number: 4 },
  ]

  const currentStepIndex = steps.findIndex(s => s.id === currentStep)

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {isAddMode ? 'Add Specimens to Batch' : 'Create Control Batch'}
        </h1>
        <p className="text-gray-500 mt-1">
          {isAddMode 
            ? 'Add specimens and containers to an existing control batch'
            : 'Create a new control batch and add specimens with containers'}
        </p>
      </div>

      {/* Step indicator */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div
                className={`flex items-center cursor-pointer ${
                  currentStep === step.id
                    ? 'text-blue-600 font-semibold'
                    : canProceedToStep(step.id)
                    ? 'text-gray-500'
                    : 'text-gray-400'
                }`}
                onClick={() => {
                  if (canProceedToStep(step.id)) {
                    setStep(step.id)
                  }
                }}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentStep === step.id
                      ? 'bg-blue-600 text-white'
                      : canProceedToStep(step.id)
                      ? 'bg-gray-200'
                      : 'bg-gray-100'
                  }`}
                >
                  {step.number}
                </div>
                <span className="ml-2 hidden sm:inline">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div className="flex-1 h-1 bg-gray-200 mx-4" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white rounded-lg shadow p-6">
        {currentStep === 'batch-info' && !isAddMode && (
          <BatchInfoStep
            batchInfo={batchInfo}
            onChange={setBatchInfo}
            onNext={() => setStep('specimen-types')}
            onCancel={() => navigate('/blood-controls')}
            isAddMode={isAddMode}
          />
        )}

        {currentStep === 'specimen-types' && (
          <SpecimenTypesStep
            specimenTypes={specimenTypes}
            onChange={setSpecimenTypes}
            availableSpecimenTypes={availableSpecimenTypes}
            onNext={() => setStep('containers')}
            onBack={isAddMode ? () => navigate(`/blood-controls/batches/${batchId}`) : () => setStep('batch-info')}
            onCancel={() => navigate(isAddMode ? `/blood-controls/batches/${batchId}` : '/blood-controls')}
            onSwitchToCSV={() => setStep('csv-upload')}
          />
        )}

        {currentStep === 'csv-upload' && (
          <CSVUploadStep
            csvFiles={csvFiles}
            onChange={setCsvFiles}
            availableSpecimenTypes={availableSpecimenTypes}
            onNext={() => setStep('containers')}
            onBack={() => setStep('specimen-types')}
            onCancel={() => navigate(isAddMode ? `/blood-controls/batches/${batchId}` : '/blood-controls')}
          />
        )}

        {currentStep === 'containers' && (
          <ContainerConfigurationStep
            specimenTypes={specimenTypes}
            csvFiles={csvFiles}
            onChangeSpecimenTypes={setSpecimenTypes}
            onChangeCsvFiles={setCsvFiles}
            onNext={() => setStep('review')}
            onBack={() => {
              if (csvFiles.length > 0) {
                setStep('csv-upload')
              } else {
                setStep('specimen-types')
              }
            }}
            onCancel={() => navigate(isAddMode ? `/blood-controls/batches/${batchId}` : '/blood-controls')}
          />
        )}

        {currentStep === 'review' && (
          <ReviewStep
            batchInfo={batchInfo}
            specimenTypes={specimenTypes}
            csvFiles={csvFiles}
            onBack={() => setStep('containers')}
            onCancel={() => navigate(isAddMode ? `/blood-controls/batches/${batchId}` : '/blood-controls')}
            onSuccess={(batchId) => {
              navigate(`/blood-controls/batches/${batchId}`)
            }}
            isAddMode={isAddMode}
            existingBatchId={batchId ? parseInt(batchId) : undefined}
          />
        )}
      </div>
    </div>
  )
}

