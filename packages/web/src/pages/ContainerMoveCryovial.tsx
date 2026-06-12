import { useState, useRef, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useCryovialMoveBootstrap, moveWorkflowKeys } from '../hooks/useMoveWorkflow'
import { useScanMoveWorkflow } from '../hooks/useScanMoveWorkflow'
import { cryovialScanMoveVariant } from '../lib/scan-move'
import { downloadCsv } from '../lib/csv'
import { generateCryovialMoveTemplate } from '../lib/cryovial-move-template'
import type { CryovialBox } from '../components/CryovialBoxPicker'
import { useUser } from '../contexts/UserContext'
import { fromQuery, getQueryErrorMessage } from '../ui'
import { useQueryClient } from '@tanstack/react-query'
import ScanMovePageShell from '../components/scan-move/ScanMovePageShell'
import { CRYOVIAL_SCAN_MOVE_COPY } from '../components/scan-move/copy'
import CryovialMoveInstructions from '../components/scan-move/CryovialMoveInstructions'
import '../styles/storage.css'

export default function ContainerMoveCryovial() {
  const { canWrite } = useUser()
  const queryClient = useQueryClient()
  const bootstrapQuery = useCryovialMoveBootstrap()
  const bootstrapStatus = fromQuery(bootstrapQuery)
  const availableBoxes = (bootstrapQuery.data?.boxes ?? []) as CryovialBox[]
  const locations = bootstrapQuery.data?.locations ?? []

  const refreshCollections = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: moveWorkflowKeys.cryovialBootstrap() })
    const refetchResult = await bootstrapQuery.refetch()
    return (refetchResult.data?.boxes ?? []) as CryovialBox[]
  }, [queryClient, bootstrapQuery])

  const wf = useScanMoveWorkflow({
    variant: cryovialScanMoveVariant,
    collections: availableBoxes,
    refreshCollections,
  })

  const [instructionsExpanded, setInstructionsExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!canWrite) {
    return <Navigate to="/" replace />
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    void wf.ingestFiles(selectedFiles)
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
    return (
      <p className="text-xs text-app-trend-up mb-1">
        ✓ Inferred from file name — you can change it below if needed.
      </p>
    )
  }

  return (
    <ScanMovePageShell
      copy={CRYOVIAL_SCAN_MOVE_COPY}
      collectionKind="box"
      wf={wf}
      locations={locations}
      collections={availableBoxes}
      bootstrapError={
        bootstrapStatus === 'error'
          ? {
              message: getQueryErrorMessage(
                bootstrapQuery.error,
                CRYOVIAL_SCAN_MOVE_COPY.bootstrapErrorDetail,
              ),
              onRetry: () => void bootstrapQuery.refetch(),
            }
          : null
      }
      instructions={
        <CryovialMoveInstructions createStepUsed={wf.state.createDestinationsStepUsed} />
      }
      instructionsExpanded={instructionsExpanded}
      onInstructionsExpandedChange={setInstructionsExpanded}
      fileInputRef={fileInputRef}
      onFileChange={handleFileChange}
      uploadHeaderExtra={
        <button
          type="button"
          onClick={() => downloadCsv(generateCryovialMoveTemplate(), 'cryovial_move_template.csv')}
          className="storage-btn-secondary"
        >
          Download Template
        </button>
      }
      renderInferredBanner={renderInferredBanner}
    />
  )
}
