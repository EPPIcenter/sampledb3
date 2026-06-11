import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ScannerConfiguration } from '../lib/api/settings'
import {
  createCollectionsScanMoveGateway,
  createScanMoveDestinations,
  executeScanMove,
  ingestScanFiles,
  initialScanMoveState,
  markMissingLocations,
  pendingDestinationsMissingLocation,
  planNextFromUpload,
  resolveScanMove,
  scanMoveReducer,
  type PendingDestination,
  type ScanMoveCollectionRef,
  type ScanMoveFileSource,
  type ScanMoveGateway,
  type ScanMoveState,
  type ScanMoveStep,
  type ScanMoveVariant,
} from '../lib/scan-move'
import { getMissingDestinationPlateNames } from '../lib/micronix-move-destination-plates'

export interface UseScanMoveWorkflowOptions {
  variant: ScanMoveVariant
  /** Current destination collections (from the bootstrap query). */
  collections: ScanMoveCollectionRef[]
  /** Re-fetch collections after destination creation; returns the fresh list. */
  refreshCollections?: () => Promise<ScanMoveCollectionRef[]>
  /** Override the production gateway (tests). */
  gateway?: ScanMoveGateway
}

const STEP_VALUES: ScanMoveStep[] = ['upload', 'create_plates', 'resolve', 'execute']

function stepFromParams(params: URLSearchParams): ScanMoveStep {
  const raw = params.get('step')
  return STEP_VALUES.includes(raw as ScanMoveStep) ? (raw as ScanMoveStep) : 'upload'
}

/**
 * Thin React shell over the scan move core (ADR 0008): owns nothing but
 * dispatch wiring, the busy flag, and one-way step → URL mirroring.
 */
export function useScanMoveWorkflow(options: UseScanMoveWorkflowOptions) {
  const { variant, collections, refreshCollections } = options
  const gateway = useMemo(
    () => options.gateway ?? createCollectionsScanMoveGateway(variant),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- variant and gateway override are stable per page
    [],
  )

  const [state, dispatch] = useReducer(scanMoveReducer, undefined, initialScanMoveState)
  const [loading, setLoading] = useState(false)
  const ingestRequestRef = useRef(0)

  const [searchParams, setSearchParams] = useSearchParams()
  const urlStep = stepFromParams(searchParams)
  // Last step this hook wrote to the URL. A URL change matching it is the
  // echo of our own mirror write, not a navigation — without this, a state
  // change racing a pending mirror write makes the two sync effects swap
  // values forever (state follows the stale URL, URL follows the stale state).
  const selfWrittenStepRef = useRef<ScanMoveStep | null>(null)

  // URL → state: initial deep link and browser navigation. The reducer's
  // guards decide whether the requested step is actually reachable.
  useEffect(() => {
    const isEcho = urlStep === selfWrittenStepRef.current
    if (isEcho) selfWrittenStepRef.current = null
    if (urlStep !== state.step && !isEcho) {
      dispatch({ type: 'STEP_SET', step: urlStep })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only on URL change
  }, [urlStep])

  // State → URL: the core owns the step; the URL mirrors it.
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

  const ingestFiles = useCallback(
    (sources: ScanMoveFileSource[], scannerConfig?: ScannerConfiguration) =>
      runBusy(async () => {
        const requestId = ++ingestRequestRef.current
        const event = await ingestScanFiles(variant, sources, { collections, scannerConfig })
        if (ingestRequestRef.current === requestId) {
          dispatch(event)
          // Ingest lands on the upload step; write it even if unchanged so the
          // URL always carries an explicit step once the workflow has begun.
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set('step', 'upload')
            return next
          })
        }
      }),
    [runBusy, variant, collections, setSearchParams],
  )

  /** Re-ingest the already-uploaded files (e.g. after a scanner config change). */
  const reingestFiles = useCallback(
    (scannerConfig?: ScannerConfiguration) =>
      ingestFiles(
        state.files.map((f) => f.file),
        scannerConfig,
      ),
    [ingestFiles, state.files],
  )

  const removeFile = useCallback((fileIndex: number) => {
    dispatch({ type: 'FILE_REMOVED', fileIndex })
  }, [])

  const selectDestination = useCallback((fileIndex: number, name: string | null) => {
    dispatch({ type: 'DESTINATION_SELECTED', fileIndex, name })
  }, [])

  const setAtomicMode = useCallback((mode: ScanMoveState['atomicMode']) => {
    dispatch({ type: 'ATOMIC_MODE_SET', mode })
  }, [])

  const goToStep = useCallback((step: ScanMoveStep) => {
    dispatch({ type: 'STEP_SET', step })
  }, [])

  const updatePendingDestination = useCallback(
    (index: number, patch: Partial<PendingDestination>) => {
      dispatch({ type: 'PENDING_DESTINATION_UPDATED', index, patch })
    },
    [],
  )

  const clearPendingDestinations = useCallback(() => {
    dispatch({ type: 'PENDING_DESTINATIONS_SET', pending: [] })
  }, [])

  const resolveAgainst = useCallback(
    async (resolveCollections: ScanMoveCollectionRef[], returnToUploadOnFailure: boolean) => {
      const event = await resolveScanMove(variant, state.files, {
        gateway,
        collections: resolveCollections,
      })
      dispatch(event)
      if (event.type === 'RESOLVE_FAILED' && returnToUploadOnFailure) {
        dispatch({ type: 'STEP_SET', step: 'upload' })
      }
    },
    [variant, state.files, gateway],
  )

  /** "Next" from the upload step: validate, route to create-destinations, or resolve. */
  const next = useCallback(() => {
    const plan = planNextFromUpload(state, collections, variant)
    if (plan.kind !== 'resolve') {
      plan.events.forEach(dispatch)
      return Promise.resolve()
    }
    return runBusy(() => resolveAgainst(collections, false))
  }, [state, collections, variant, runBusy, resolveAgainst])

  /** Resolve against a freshly refetched collection list (post-create flows). */
  const resolveWithFreshCollections = useCallback(
    () =>
      runBusy(async () => {
        const fresh = refreshCollections ? await refreshCollections() : collections
        await resolveAgainst(fresh, true)
      }),
    [runBusy, refreshCollections, collections, resolveAgainst],
  )

  /** Create all pending destinations, then resolve with the fresh collection list. */
  const createDestinationsAndResolve = useCallback(() => {
    if (pendingDestinationsMissingLocation(state.pendingDestinations)) {
      dispatch({
        type: 'PENDING_DESTINATIONS_SET',
        pending: markMissingLocations(state.pendingDestinations),
      })
      return Promise.resolve()
    }
    return runBusy(async () => {
      const { allSuccess } = await createScanMoveDestinations(
        state.pendingDestinations,
        gateway,
        dispatch,
      )
      if (!allSuccess) return
      const fresh = refreshCollections ? await refreshCollections() : collections
      await resolveAgainst(fresh, true)
    })
  }, [state.pendingDestinations, runBusy, gateway, refreshCollections, collections, resolveAgainst])

  const executeMoves = useCallback(
    () =>
      runBusy(async () => {
        dispatch(await executeScanMove(variant, state, gateway))
      }),
    [runBusy, variant, state, gateway],
  )

  const reset = useCallback(() => {
    dispatch({ type: 'WORKFLOW_RESET' })
  }, [])

  const missingDestinationNames = useMemo(
    () =>
      getMissingDestinationPlateNames(
        state.files.map((f) => f.selectedDestinationName),
        collections,
      ),
    [state.files, collections],
  )

  const destinationsAlreadyCreated = useMemo(
    () =>
      state.pendingDestinations.length > 0 &&
      state.pendingDestinations.every((p) => p.status === 'success'),
    [state.pendingDestinations],
  )

  return {
    state,
    step: state.step,
    loading,
    missingDestinationNames,
    destinationsAlreadyCreated,
    ingestFiles,
    reingestFiles,
    removeFile,
    selectDestination,
    setAtomicMode,
    goToStep,
    updatePendingDestination,
    clearPendingDestinations,
    next,
    resolveWithFreshCollections,
    createDestinationsAndResolve,
    executeMoves,
    reset,
  }
}

export type ScanMoveWorkflow = ReturnType<typeof useScanMoveWorkflow>
