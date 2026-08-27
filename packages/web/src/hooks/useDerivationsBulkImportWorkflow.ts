import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { BulkDerivationSettings } from '../lib/api/derivations'
import {
  createDerivationsBulkGateway,
  createMissingCollections,
  derivationsBulkReducer,
  fileLoadedEvent,
  fileReadErrorEvent,
  importDerivationsCsv,
  initialDerivationsBulkState,
  selectCsvForImport,
  selectMissingCollections,
  validateDerivationsCsv,
  type DerivationsBulkGateway,
  type DerivationsBulkStep,
} from '../lib/derivations-bulk-import'

const STEP_VALUES: DerivationsBulkStep[] = ['upload', 'collections', 'review', 'import']

function stepFromParams(params: URLSearchParams): DerivationsBulkStep {
  const raw = params.get('step')
  return STEP_VALUES.includes(raw as DerivationsBulkStep) ? (raw as DerivationsBulkStep) : 'upload'
}

export interface UseDerivationsBulkImportWorkflowOptions {
  settings: BulkDerivationSettings
  gateway?: DerivationsBulkGateway
}

/**
 * Thin React shell over the Derivation bulk-import core: dispatch wiring,
 * the busy flag, and one-way step → URL mirroring.
 */
export function useDerivationsBulkImportWorkflow(options: UseDerivationsBulkImportWorkflowOptions) {
  const gateway = useMemo(
    () => options.gateway ?? createDerivationsBulkGateway(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gateway override is stable per page
    [],
  )

  const [state, dispatch] = useReducer(derivationsBulkReducer, undefined, initialDerivationsBulkState)
  const [loading, setLoading] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const urlStep = stepFromParams(searchParams)
  const selfWrittenStepRef = useRef<DerivationsBulkStep | null>(null)

  useEffect(() => {
    const isEcho = urlStep === selfWrittenStepRef.current
    if (isEcho) selfWrittenStepRef.current = null
    if (urlStep !== state.step && !isEcho) {
      dispatch({ type: 'STEP_SET', step: urlStep })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only on URL change
  }, [urlStep])

  useEffect(() => {
    if (state.step !== urlStep) {
      selfWrittenStepRef.current = state.step
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('step', state.step)
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror only on step change
  }, [state.step])

  const runBusy = useCallback(async (work: () => Promise<void>) => {
    setLoading(true)
    try {
      await work()
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCsvText = useCallback((csvContent: string) => {
    dispatch(fileLoadedEvent(csvContent))
  }, [])

  const failFileRead = useCallback(() => {
    dispatch(fileReadErrorEvent())
  }, [])

  const clearFile = useCallback(() => {
    dispatch({ type: 'FILE_CLEARED' })
  }, [])

  const validateAndContinue = useCallback(
    (event?: { preventDefault(): void }) => {
      event?.preventDefault()
      return runBusy(async () => {
        const events = await validateDerivationsCsv(gateway, state.csvContent, options.settings)
        events.forEach((e) => dispatch(e))
      })
    },
    [gateway, options.settings, runBusy, state.csvContent],
  )

  const setReviewCell = useCallback((rowIndex: number, header: string, value: string) => {
    dispatch({ type: 'REVIEW_CELL_SET', rowIndex, header, value })
  }, [])

  const setCollectionLocation = useCallback((index: number, locationId: number | null) => {
    dispatch({ type: 'COLLECTION_PATCHED', index, patch: { locationId } })
  }, [])

  const goToStep = useCallback((step: DerivationsBulkStep) => {
    dispatch({ type: 'STEP_SET', step })
  }, [])

  const createCollections = useCallback(() => {
    return runBusy(async () => {
      await createMissingCollections(selectMissingCollections(state), gateway, dispatch)
    })
  }, [gateway, runBusy, state])

  const importCsv = useCallback(() => {
    return runBusy(async () => {
      const events = await importDerivationsCsv(
        gateway,
        selectCsvForImport(state),
        options.settings,
      )
      events.forEach((e) => dispatch(e))
    })
  }, [gateway, options.settings, runBusy, state])

  const missingCollections = useMemo(() => selectMissingCollections(state), [state])

  return {
    state,
    loading,
    missingCollections,
    loadCsvText,
    failFileRead,
    clearFile,
    validateAndContinue,
    setReviewCell,
    setCollectionLocation,
    goToStep,
    createCollections,
    importCsv,
  }
}
