import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom'
import BatchInfoStep from '../components/wizards/BatchInfoStep'
import SpecimenTypesStep from '../components/wizards/SpecimenTypesStep'
import CSVUploadStep from '../components/wizards/CSVUploadStep'
import ContainerConfigurationStep from '../components/wizards/ContainerConfigurationStep'
import ReviewStep from '../components/wizards/ReviewStep'
import { controlsApi, specimenTypesApi } from '../lib/api'
import type { ControlDefinition, SpecimenType } from '../lib/api'
import { useUser } from '../contexts/UserContext'
import { getCompositionKey } from '../lib/composition-key'
import '../styles/blood-controls.css'

/** Strains for composition (used for multi-batch CSV flow). */
export type CompositionStrains = Array<{ id: number; percentage?: number }>

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
    /** Optional density; when present, rows are grouped by density for batch creation */
    density?: number
    /** For paper (DBS): sheet name for this row. Multiple rows can share a sheet; sheets go into the file's collection (box/bag). */
    sheet_name?: string
  }>
  containerType?: 'paper' | 'cryovial_tube' | 'micronix_tube'
  /** True when container type was fully inferred (sheet_name → paper). When false but containerCategoryInferred === 'tube', user picks cryovial vs micronix. */
  containerTypeInferred?: boolean
  /** When 'tube', template had position column; user must choose cryovial or micronix. */
  containerCategoryInferred?: 'paper' | 'tube'
  collectionId?: number
  collectionName?: string
  collectionLocationId?: number
  collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  sheetName?: string
  errors: Array<{ row: number; field?: string; error: string }>
}

export default function ControlBatchWizard() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const { id: batchId, definitionId, compositionKey: compositionKeyParam } = useParams<{
    id?: string
    definitionId?: string
    compositionKey?: string
  }>()
  const [searchParams, setSearchParams] = useSearchParams()

  if (!canWrite) {
    return <Navigate to="/blood-controls" replace />
  }

  const compositionKey = compositionKeyParam ? decodeURIComponent(compositionKeyParam) : null
  // Composition route is only used for "add batches from CSV"; path alone defines the short flow.
  const isCompositionCsvFlow = !!compositionKey

  const isAddMode = !!batchId
  const isCreateFromDefinition = !!definitionId && !isCompositionCsvFlow
  // Composition CSV flow: start at csv-upload. Add mode: specimen-types. From definition: batch-info.
  const defaultStep = isCompositionCsvFlow
    ? 'csv-upload'
    : isAddMode
      ? 'specimen-types'
      : 'batch-info'
  const currentStep = (searchParams.get('step') as WizardStep) || defaultStep

  const [batchInfo, setBatchInfo] = useState<BatchInfo>({
    controlDefinitionId: null,
    controlDefinition: null,
    name: '',
    productionDate: new Date().toISOString().split('T')[0],
  })
  
  const [compositionStrains, setCompositionStrains] = useState<CompositionStrains | null>(null)
  const [compositionDefinitions, setCompositionDefinitions] = useState<ControlDefinition[] | null>(null)
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenTypeConfig[]>([])
  const [csvFiles, setCsvFiles] = useState<CSVFileData[]>([])
  const [availableSpecimenTypes, setAvailableSpecimenTypes] = useState<SpecimenType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSpecimenTypes()
    if (isAddMode && batchId) {
      loadExistingBatch(parseInt(batchId))
    } else if (isCompositionCsvFlow && compositionKey) {
      loadCompositionStrains(compositionKey)
    } else if (isCreateFromDefinition && definitionId) {
      loadDefinitionAndBatchInfo(parseInt(definitionId))
    }
  }, [batchId, isAddMode, definitionId, isCreateFromDefinition, isCompositionCsvFlow, compositionKey])

  const loadSpecimenTypes = async () => {
    try {
      const response = await specimenTypesApi.list()
      setAvailableSpecimenTypes(response.data)
    } catch (err) {
      console.error('Failed to load specimen types:', err)
      setAvailableSpecimenTypes([]) // Clear on error
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

  const loadCompositionStrains = async (key: string) => {
    try {
      setLoading(true)
      setError(null)
      const res = await controlsApi.list()
      const all = (res.data.controls ?? []) as ControlDefinition[]
      const defs = all.filter((def) => {
        const defKey = getCompositionKey((def.strains ?? []).map((s) => ({ id: s.id, percentage: s.percentage })))
        return defKey === key
      })
      setCompositionDefinitions(defs.length > 0 ? defs.sort((a, b) => (a.targetDensity ?? 0) - (b.targetDensity ?? 0)) : null)
      if (defs.length > 0 && defs[0].strains?.length) {
        setCompositionStrains(
          defs[0].strains.map((s) => ({ id: s.id, percentage: s.percentage }))
        )
      } else {
        setError('Composition not found or has no strain data')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load composition')
    } finally {
      setLoading(false)
    }
  }

  const loadDefinitionAndBatchInfo = async (defId: number) => {
    try {
      setLoading(true)
      setError(null)
      const today = new Date().toISOString().split('T')[0]
      const [summaryResponse, nameResponse] = await Promise.all([
        controlsApi.getDefinitionSummary(defId),
        controlsApi.suggestBatchName(defId, today),
      ])
      const { control, composition } = summaryResponse.data
      if (!control) {
        setError('Control definition not found')
        return
      }
      const controlWithComposition = {
        ...control,
        strains: composition?.strains,
      }
      setBatchInfo({
        controlDefinitionId: control.id,
        controlDefinition: controlWithComposition,
        name: nameResponse.data.name,
        productionDate: today,
      })
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load control definition')
    } finally {
      setLoading(false)
    }
  }

  const getCancelTarget = () => {
    if (isAddMode && batchId) return `/blood-controls/batches/${batchId}`
    if (isCompositionCsvFlow && compositionKey) return `/blood-controls/compositions/${encodeURIComponent(compositionKey)}`
    if (isCreateFromDefinition && definitionId) return `/blood-controls/${definitionId}`
    return '/blood-controls'
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
        return !isAddMode // Creating new batch (from definition or standalone)
      case 'specimen-types':
      case 'csv-upload':
        return isAddMode || !!batchInfo.controlDefinitionId || isCompositionCsvFlow
      case 'containers':
        return specimenTypes.length > 0 || csvFiles.length > 0
      case 'review':
        return (specimenTypes.length > 0 || csvFiles.length > 0) &&
               (specimenTypes.every(st => st.containers.length > 0) || 
                csvFiles.every(f => {
                  const collectionOk =
                    f.collectionId != null ||
                    (!!f.collectionName && f.collectionLocationId != null && !!f.collectionType)
                  const paperNeedsSheet = f.containerType === 'paper'
                    ? (!!f.sheetName?.trim() || (f.rows?.length > 0 && f.rows.every(r => !!(r.sheet_name?.trim()))))
                    : true
                  return collectionOk && paperNeedsSheet
                }))
      default:
        return false
    }
  }

  // Flow-specific steps so the indicator only shows relevant steps with correct numbers
  const steps: Array<{ id: WizardStep; label: string; number: number }> = (() => {
    if (isCompositionCsvFlow) {
      return [
        { id: 'csv-upload', label: 'Upload CSV', number: 1 },
        { id: 'containers', label: 'Containers', number: 2 },
        { id: 'review', label: 'Review', number: 3 },
      ]
    }
    if (isAddMode) {
      return [
        { id: 'specimen-types', label: 'Specimen Types', number: 1 },
        { id: 'csv-upload', label: 'CSV Upload', number: 2 },
        { id: 'containers', label: 'Containers', number: 3 },
        { id: 'review', label: 'Review', number: 4 },
      ]
    }
    return [
      { id: 'batch-info', label: 'Batch Info', number: 1 },
      { id: 'specimen-types', label: 'Specimen Types', number: 2 },
      { id: 'csv-upload', label: 'CSV Upload', number: 3 },
      { id: 'containers', label: 'Containers', number: 4 },
      { id: 'review', label: 'Review', number: 5 },
    ]
  })()

  const currentStepIndex = steps.findIndex(s => s.id === currentStep)
  const effectiveStep: WizardStep =
    currentStepIndex >= 0 ? currentStep : defaultStep

  useEffect(() => {
    if (currentStepIndex >= 0) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', defaultStep)
      return next
    })
  }, [currentStepIndex, defaultStep, setSearchParams])

  if (loading) {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="text-center" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (error) {
    const backTarget = isCompositionCsvFlow && compositionKey
      ? `/blood-controls/compositions/${encodeURIComponent(compositionKey)}`
      : isCreateFromDefinition && definitionId
        ? `/blood-controls/${definitionId}`
        : '/blood-controls'
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="text-center space-y-4">
            <p style={{ color: 'rgb(var(--dashboard-trend-down))' }}>{error}</p>
            <button
              onClick={() => navigate(backTarget)}
              className="blood-controls-btn-secondary"
            >
              Back to {isCreateFromDefinition && definitionId ? 'Control Definition' : 'Blood Controls'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="blood-controls-page">
      <div className="container mx-auto px-4 py-8 max-w-6xl relative z-[1]">
        <div className="mb-6 blood-controls-reveal blood-controls-reveal-1">
          <h1 className="text-3xl font-bold">
            {isAddMode ? 'Add Specimens to Batch' : 'Create Control Batch'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
            {isAddMode
              ? 'Add specimens and containers to an existing control batch'
              : 'Create a new control batch and add specimens with containers'}
          </p>
        </div>

        {/* Step indicator */}
        <div className="dashboard-card p-4 mb-6 blood-controls-reveal blood-controls-reveal-2">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={`flex items-center cursor-pointer ${effectiveStep === step.id ? 'font-semibold' : ''}`}
                  style={{
                    color: effectiveStep === step.id ? 'rgb(var(--dashboard-accent))' : canProceedToStep(step.id) ? 'rgb(var(--dashboard-text-muted))' : 'rgb(var(--dashboard-border))',
                  }}
                  onClick={() => {
                    if (canProceedToStep(step.id)) {
                      setStep(step.id)
                    }
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      background: effectiveStep === step.id ? 'rgb(var(--dashboard-accent))' : canProceedToStep(step.id) ? 'rgb(var(--dashboard-border))' : 'rgb(var(--dashboard-surface))',
                      color: effectiveStep === step.id ? 'white' : 'rgb(var(--dashboard-text-muted))',
                    }}
                  >
                    {step.number}
                  </div>
                  <span className="ml-2 hidden sm:inline">{step.label}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 h-1 mx-4" style={{ background: 'rgb(var(--dashboard-border))' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-3">
        {effectiveStep === 'batch-info' && !isAddMode && (
          <BatchInfoStep
            batchInfo={batchInfo}
            onChange={setBatchInfo}
            onNext={() => setStep('specimen-types')}
            onCancel={() => navigate(getCancelTarget())}
            isAddMode={isAddMode}
            definitionPreSelected={isCreateFromDefinition}
          />
        )}

        {effectiveStep === 'specimen-types' && (
          <SpecimenTypesStep
            specimenTypes={specimenTypes}
            onChange={setSpecimenTypes}
            availableSpecimenTypes={availableSpecimenTypes}
            onNext={() => setStep('containers')}
            onBack={
              isAddMode
                ? () => navigate(`/blood-controls/batches/${batchId}`)
                : () => setStep('batch-info')
            }
            onCancel={() => navigate(getCancelTarget())}
            onSwitchToCSV={() => setStep('csv-upload')}
          />
        )}

        {effectiveStep === 'csv-upload' && (
          <CSVUploadStep
            csvFiles={csvFiles}
            onChange={setCsvFiles}
            availableSpecimenTypes={availableSpecimenTypes}
            onNext={() => setStep('containers')}
            onBack={
              isCompositionCsvFlow
                ? () => navigate(getCancelTarget())
                : () => setStep('specimen-types')
            }
            backLabel={isCompositionCsvFlow ? 'Cancel' : undefined}
            onCancel={() => navigate(getCancelTarget())}
            showProductionDate={isCompositionCsvFlow}
            batchInfo={isCompositionCsvFlow ? { productionDate: batchInfo.productionDate } : undefined}
            onBatchInfoChange={
              isCompositionCsvFlow
                ? (info) => setBatchInfo((prev) => ({ ...prev, ...info }))
                : undefined
            }
          />
        )}

        {effectiveStep === 'containers' && (
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
            onCancel={() => navigate(getCancelTarget())}
          />
        )}

        {effectiveStep === 'review' && (
          <ReviewStep
            batchInfo={batchInfo}
            compositionStrains={compositionStrains}
            compositionDefinitions={compositionDefinitions}
            specimenTypes={specimenTypes}
            csvFiles={csvFiles}
            onBack={() => setStep('containers')}
            onCancel={() => navigate(getCancelTarget())}
            onSuccess={(batchId) => {
              navigate(`/blood-controls/batches/${batchId}`)
            }}
            isAddMode={isAddMode}
            existingBatchId={batchId ? parseInt(batchId) : undefined}
            onBatchInfoChange={isCompositionCsvFlow ? (info) => setBatchInfo((prev) => ({ ...prev, ...info })) : undefined}
          />
        )}
        </div>
      </div>
    </div>
  )
}

