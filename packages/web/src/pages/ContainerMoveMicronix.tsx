import { useState, useEffect, useRef, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useMicronixMoveBootstrap, moveWorkflowKeys } from '../hooks/useMoveWorkflow'
import { useScanMoveWorkflow } from '../hooks/useScanMoveWorkflow'
import { micronixScanMoveVariant } from '../lib/scan-move'
import type { MicronixPlate } from '../components/MicronixPlatePicker'
import { useUser } from '../contexts/UserContext'
import { fromQuery, getQueryErrorMessage } from '../ui'
import { useQueryClient } from '@tanstack/react-query'
import ScanMovePageShell from '../components/scan-move/ScanMovePageShell'
import { MICRONIX_SCAN_MOVE_COPY } from '../components/scan-move/copy'
import MicronixMoveInstructions from '../components/scan-move/MicronixMoveInstructions'
import MicronixScannerConfigPanel from '../components/scan-move/MicronixScannerConfigPanel'
import '../styles/storage.css'

export default function ContainerMoveMicronix() {
  const { canWrite } = useUser()
  const queryClient = useQueryClient()
  const bootstrapQuery = useMicronixMoveBootstrap()
  const bootstrapStatus = fromQuery(bootstrapQuery)
  const availablePlates = (bootstrapQuery.data?.plates ?? []) as MicronixPlate[]
  const locations = bootstrapQuery.data?.locations ?? []
  const scannerConfigurations = bootstrapQuery.data?.scannerConfigurations ?? []

  const refreshCollections = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: moveWorkflowKeys.micronixBootstrap() })
    const refetchResult = await bootstrapQuery.refetch()
    return (refetchResult.data?.plates ?? []) as MicronixPlate[]
  }, [queryClient, bootstrapQuery])

  const wf = useScanMoveWorkflow({
    variant: micronixScanMoveVariant,
    collections: availablePlates,
    refreshCollections,
  })

  const [instructionsExpanded, setInstructionsExpanded] = useState(false)
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scannerConfigurations.length === 0 || selectedConfigId !== null) return
    const defaultConfig =
      scannerConfigurations.find((c) => c.isDefault === true) ?? scannerConfigurations[0]
    if (defaultConfig) setSelectedConfigId(defaultConfig.id)
  }, [scannerConfigurations, selectedConfigId])

  if (!canWrite) {
    return <Navigate to="/" replace />
  }

  const handleConfigChange = (newId: string) => {
    setSelectedConfigId(newId)
    if (wf.state.files.length === 0) return
    const config = scannerConfigurations.find((c) => c.id === newId)
    if (!config) return
    void wf.reingestFiles(config)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    const selectedConfig = scannerConfigurations.find((c) => c.id === selectedConfigId)
    if (!selectedConfig) return
    void wf.ingestFiles(selectedFiles, selectedConfig)
  }

  const renderInferredBanner = (fileData: {
    inferredMatches: { name: string }[]
    selectedDestinationName: string | null
  }) => {
    if (
      fileData.inferredMatches.length !== 1 ||
      fileData.selectedDestinationName !== fileData.inferredMatches[0].name
    ) {
      return null
    }
    const cfg = scannerConfigurations.find((c) => c.id === selectedConfigId)
    const fromCol = cfg?.plateNameSource === 'column' && cfg.plateNameColumn?.trim()
    return (
      <p className="text-xs text-app-trend-up mb-1">
        ✓ Inferred from {fromCol ? `column "${cfg!.plateNameColumn!.trim()}"` : 'file name'} — you can change it below if needed.
      </p>
    )
  }

  return (
    <ScanMovePageShell
      copy={MICRONIX_SCAN_MOVE_COPY}
      collectionKind="plate"
      previewHideKeys={['container_barcode', 'target_position']}
      wf={wf}
      locations={locations}
      collections={availablePlates}
      bootstrapError={
        bootstrapStatus === 'error'
          ? {
              message: getQueryErrorMessage(
                bootstrapQuery.error,
                MICRONIX_SCAN_MOVE_COPY.bootstrapErrorDetail,
              ),
              onRetry: () => void bootstrapQuery.refetch(),
            }
          : null
      }
      instructions={
        <MicronixMoveInstructions createStepUsed={wf.state.createDestinationsStepUsed} />
      }
      instructionsExpanded={instructionsExpanded}
      onInstructionsExpandedChange={setInstructionsExpanded}
      fileInputRef={fileInputRef}
      onFileChange={handleFileChange}
      fileInputDisabled={!selectedConfigId}
      uploadBeforeFiles={
        <MicronixScannerConfigPanel
          scannerConfigurations={scannerConfigurations}
          selectedConfigId={selectedConfigId}
          onConfigChange={handleConfigChange}
        />
      }
      renderInferredBanner={renderInferredBanner}
    />
  )
}
