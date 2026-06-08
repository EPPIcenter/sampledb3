import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom'
import BatchInfoStep from '../components/wizards/BatchInfoStep'
import SpecimenTypesStep from '../components/wizards/SpecimenTypesStep'
import CSVUploadStep from '../components/wizards/CSVUploadStep'
import ContainerConfigurationStep from '../components/wizards/ContainerConfigurationStep'
import ReviewStep from '../components/wizards/ReviewStep'
import type { ControlDefinition } from '../lib/api/controls'
import { useSpecimenTypes } from '../hooks/useReferenceData'
import {
  useCompositionDefinitionsByKey,
  useControlBatchWizardBootstrap,
  useControlDefinitionWizardSeed,
} from '../hooks/useControls'
import { useUser } from '../contexts/UserContext'
import { PageError, fromQuery, getQueryErrorMessage } from '../ui'
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
  /** Tube identifier (micronix/cryovial). */
  barcode?: string
  /** Paper spot identifier. */
  sublabel?: string
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
    sublabel?: string
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

export function canProceedToReview(
  specimenTypes: SpecimenTypeConfig[],
  csvFiles: CSVFileData[],
): boolean {
  const hasManual = specimenTypes.length > 0
  const hasCsv = csvFiles.length > 0
  if (!hasManual && !hasCsv) return false
  const manualOk = !hasManual || specimenTypes.every(st => st.containers.length > 0)
  const csvOk = !hasCsv || csvFiles.every(f => {
    const collectionOk =
      f.collectionId != null ||
      (!!f.collectionName && f.collectionLocationId != null && !!f.collectionType)
    const paperNeedsSheet = f.containerType === 'paper'
      ? (!!(f.sheetName?.trim()) || (f.rows.length > 0 && f.rows.every(r => !!(r.sheet_name?.trim()))))
      : true
    return collectionOk && paperNeedsSheet
  })
  return manualOk && csvOk
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
  const currentStep = (searchParams.get('step') as WizardStep | null) ?? defaultStep

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

  const parsedBatchId = isAddMode && batchId ? parseInt(batchId, 10) : undefined
  const parsedDefinitionId =
    isCreateFromDefinition && definitionId ? parseInt(definitionId, 10) : undefined

  const batchBootstrapQuery = useControlBatchWizardBootstrap(parsedBatchId)
  const definitionSeedQuery = useControlDefinitionWizardSeed(parsedDefinitionId)
  const compositionQuery = useCompositionDefinitionsByKey(
    isCompositionCsvFlow ? compositionKey : undefined,
  )

  const specimenTypesCatalogQuery = useSpecimenTypes({ silent: true })
  const specimenTypesCatalogStatus = fromQuery(specimenTypesCatalogQuery)
  const availableSpecimenTypes = specimenTypesCatalogQuery.data ?? []

  useEffect(() => {
    const data = batchBootstrapQuery.data
    if (!data) return
    setBatchInfo({
      controlDefinitionId: data.batch.controlDefinitionId,
      controlDefinition: data.controlDefinition,
      name: data.batch.name,
      productionDate: data.batch.productionDate || new Date().toISOString().split('T')[0],
      properties: data.batch.properties,
    })
  }, [batchBootstrapQuery.data])

  useEffect(() => {
    const seed = definitionSeedQuery.data
    if (!seed) return
    const { control, composition } = seed.summaryResponse
    if (!control) return
    setBatchInfo({
      controlDefinitionId: control.id,
      controlDefinition: { ...control, strains: composition?.strains },
      name: seed.suggestedName,
      productionDate: seed.productionDate,
    })
  }, [definitionSeedQuery.data])

  useEffect(() => {
    const defs = compositionQuery.data
    if (!defs) return
    setCompositionDefinitions(defs.length > 0 ? defs : null)
    if (defs.length > 0 && defs[0].strains?.length) {
      setCompositionStrains(
        defs[0].strains.map((s) => ({ id: s.id, percentage: s.percentage })),
      )
    }
  }, [compositionQuery.data])

  const bootstrapErrorMessage = useMemo(() => {
    if (isAddMode && batchBootstrapQuery.isError) {
      return getQueryErrorMessage(batchBootstrapQuery.error, 'Failed to load batch')
    }
    if (isCreateFromDefinition && definitionSeedQuery.isError) {
      return getQueryErrorMessage(definitionSeedQuery.error, 'Failed to load control definition')
    }
    if (isCreateFromDefinition && definitionSeedQuery.isSuccess) {
      if (!definitionSeedQuery.data.summaryResponse.control) {
        return 'Control definition not found'
      }
    }
    if (isCompositionCsvFlow && compositionQuery.isError) {
      return getQueryErrorMessage(compositionQuery.error, 'Failed to load composition')
    }
    if (isCompositionCsvFlow && compositionQuery.isSuccess) {
      const defs = compositionQuery.data
      if (defs.length === 0 || !defs[0]?.strains?.length) {
        return 'Composition not found or has no strain data'
      }
    }
    return null
  }, [
    isAddMode,
    isCreateFromDefinition,
    isCompositionCsvFlow,
    batchBootstrapQuery.isError,
    batchBootstrapQuery.error,
    definitionSeedQuery.isError,
    definitionSeedQuery.error,
    definitionSeedQuery.isSuccess,
    definitionSeedQuery.data,
    compositionQuery.isError,
    compositionQuery.error,
    compositionQuery.isSuccess,
    compositionQuery.data,
  ])

  const bootstrapLoading =
    (isAddMode && batchBootstrapQuery.isPending) ||
    (isCreateFromDefinition && definitionSeedQuery.isPending) ||
    (isCompositionCsvFlow && compositionQuery.isPending)

  const bootstrapQueryForRetry = isAddMode
    ? batchBootstrapQuery
    : isCompositionCsvFlow
      ? compositionQuery
      : isCreateFromDefinition
        ? definitionSeedQuery
        : null

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
        return canProceedToReview(specimenTypes, csvFiles)
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
  const urlStepValid = currentStepIndex >= 0
  const onContainersOrReviewWithoutData =
    (currentStep === 'containers' || currentStep === 'review') &&
    !canProceedToStep('containers')
  const effectiveStep: WizardStep = !urlStepValid
    ? defaultStep
    : onContainersOrReviewWithoutData
      ? defaultStep
      : currentStep

  useEffect(() => {
    if (effectiveStep === currentStep) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', effectiveStep)
      return next
    })
  }, [effectiveStep, currentStep, setSearchParams])

  if (bootstrapLoading) {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="text-center" style={{ color: 'rgb(var(--app-text-muted))' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (bootstrapErrorMessage) {
    const backTarget = isCompositionCsvFlow && compositionKey
      ? `/blood-controls/compositions/${encodeURIComponent(compositionKey)}`
      : isCreateFromDefinition && definitionId
        ? `/blood-controls/${definitionId}`
        : '/blood-controls'
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 max-w-6xl relative z-[1]">
          <PageError
            title="Could not load wizard"
            message={bootstrapErrorMessage}
            onRetry={
              bootstrapQueryForRetry
                ? () => void bootstrapQueryForRetry.refetch()
                : undefined
            }
          />
          <div className="mt-4 text-center">
            <button
              type="button"
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

  const needsSpecimenTypeCatalog =
    effectiveStep === 'specimen-types' || effectiveStep === 'csv-upload'

  if (specimenTypesCatalogStatus === 'error') {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 max-w-6xl relative z-[1]">
          <PageError
            title="Could not load specimen types"
            message={getQueryErrorMessage(
              specimenTypesCatalogQuery.error,
              'Failed to load specimen types',
            )}
            onRetry={() => void specimenTypesCatalogQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (needsSpecimenTypeCatalog && specimenTypesCatalogStatus === 'loading') {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="text-center" style={{ color: 'rgb(var(--app-text-muted))' }}>Loading specimen types...</div>
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
          <p className="mt-1 text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>
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
                    color: effectiveStep === step.id ? 'rgb(var(--app-accent))' : canProceedToStep(step.id) ? 'rgb(var(--app-text-muted))' : 'rgb(var(--app-border))',
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
                      background: effectiveStep === step.id ? 'rgb(var(--app-accent))' : canProceedToStep(step.id) ? 'rgb(var(--app-border))' : 'rgb(var(--app-surface))',
                      color: effectiveStep === step.id ? 'white' : 'rgb(var(--app-text-muted))',
                    }}
                  >
                    {step.number}
                  </div>
                  <span className="ml-2 hidden sm:inline">{step.label}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 h-1 mx-4" style={{ background: 'rgb(var(--app-border))' }} />
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

