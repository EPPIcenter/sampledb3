import type {
  ScanMoveEvent,
  ScanMoveFile,
  ScanMoveGateway,
  ScanMoveIdentifier,
  ScanMovePerFileResult,
  ScanMoveState,
  ScanMoveValidationError,
  ScanMoveVariant,
} from './types'

export interface ScanMovePlannedMove {
  identifier: ScanMoveIdentifier
  targetPosition: string
  fileIndex: number
  /** 1-based CSV data row in that file, as upload errors number rows. */
  csvRow: number
}

export type ScanMovePlan =
  | {
      ok: true
      moves: ScanMovePlannedMove[]
      mappings: Array<{ fromCollectionName: string; toCollectionName: string }>
    }
  | { ok: false; error: string }

/**
 * Build the move request: every moving row becomes a move, and each source
 * collection maps to exactly one destination across all files.
 */
export function buildMovePlan(files: ScanMoveFile[], variant: ScanMoveVariant): ScanMovePlan {
  const moves: ScanMovePlannedMove[] = []
  files.forEach((file, fileIndex) => {
    file.csvRows.forEach((row, rowIndex) => {
      const identifier = variant.identifierFromRow(row)
      if (identifier === null) return
      moves.push({ identifier, targetPosition: row.target_position.trim(), fileIndex, csvRow: rowIndex + 1 })
    })
  })

  const sourceToDestination = new Map<string, string>()
  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex]
    const destination = file.selectedDestinationName
    if (!destination) continue
    for (const resolved of file.resolvedContainers) {
      const source = resolved.container.currentCollectionName
      if (!source) continue
      const existing = sourceToDestination.get(source)
      if (existing !== undefined && existing !== destination) {
        return {
          ok: false,
          error:
            `Source ${variant.destinationNoun} "${source}" appears in multiple files with different destinations: ` +
            `"${existing}" and "${destination}". Each source ${variant.destinationNoun} must map to a single destination.`,
        }
      }
      sourceToDestination.set(source, destination)
    }
  }

  return {
    ok: true,
    moves,
    mappings: [...sourceToDestination.entries()].map(([from, to]) => ({
      fromCollectionName: from,
      toCollectionName: to,
    })),
  }
}

interface MoveResponseError {
  row: number
  error: string
}

/**
 * The move endpoint numbers error rows by position in the request's moves
 * list, which spans every file and skips empty wells. Map each error back to
 * the file and CSV row it came from; errors without a usable row stay
 * unattributed.
 */
function attributeErrors(
  files: ScanMoveFile[],
  moves: ScanMovePlannedMove[],
  errors: MoveResponseError[],
): { byFile: ScanMoveValidationError[][]; unattributed: ScanMoveValidationError[] } {
  const byFile: ScanMoveValidationError[][] = files.map(() => [])
  const unattributed: ScanMoveValidationError[] = []
  for (const error of errors) {
    const move = Number.isInteger(error.row) && error.row > 0 ? moves[error.row - 1] : undefined
    if (move === undefined) {
      unattributed.push({ row: 0, error: error.error })
      continue
    }
    byFile[move.fileIndex].push({
      row: move.csvRow,
      error: error.error,
      filename: files[move.fileIndex].filename,
    })
  }
  return { byFile, unattributed }
}

/**
 * Map a move response, successful or not, back onto files: per-file moved
 * counts and errors, plus the errors no row accounts for.
 */
export function buildPerFileResults(
  files: ScanMoveFile[],
  moves: ScanMovePlannedMove[],
  response: { success: boolean; moved?: number; errors?: MoveResponseError[] },
): { fileResults: ScanMovePerFileResult[]; unattributed: ScanMoveValidationError[] } {
  const { byFile, unattributed } = attributeErrors(files, moves, response.errors ?? [])
  const erroredRows = new Set(
    (response.errors ?? []).map((e) => e.row).filter((row) => row > 0 && row <= moves.length),
  )
  // A partial result splits per file only when every non-errored move is
  // accounted for (best effort); otherwise the per-file count is unknown.
  const partialSplits = !response.success && (response.moved ?? 0) === moves.length - erroredRows.size
  const fileResults = files.map((file, fileIndex): ScanMovePerFileResult => {
    const fileMoveCount = moves.filter((m) => m.fileIndex === fileIndex).length
    let moved: number | undefined
    if (response.success) moved = fileMoveCount
    else if ((response.moved ?? 0) === 0) moved = 0
    else if (partialSplits) moved = fileMoveCount - byFile[fileIndex].length
    return {
      filename: file.filename,
      destinationName: file.selectedDestinationName ?? '',
      moved,
      errors: byFile[fileIndex],
    }
  })
  return { fileResults, unattributed }
}

/** Execute effect: build the plan, run the move, normalize errors. */
export async function executeScanMove(
  variant: ScanMoveVariant,
  state: ScanMoveState,
  gateway: ScanMoveGateway,
): Promise<ScanMoveEvent> {
  const plan = buildMovePlan(state.files, variant)
  if (!plan.ok) {
    return {
      type: 'MOVE_COMPLETED',
      result: { success: false, moved: 0, errors: [{ row: 0, error: plan.error }] },
    }
  }

  try {
    const response = await gateway.moveContainers({
      collectionType: variant.collectionType,
      atomicMode: state.atomicMode,
      mappings: plan.mappings,
      moves: plan.moves.map(({ identifier, targetPosition }) => ({ identifier, targetPosition })),
    })
    const { fileResults, unattributed } = buildPerFileResults(state.files, plan.moves, response)
    return {
      type: 'MOVE_COMPLETED',
      result: {
        success: response.success,
        moved: response.moved || 0,
        errors: response.success || unattributed.length === 0 ? undefined : unattributed,
        fileResults,
      },
    }
  } catch (err) {
    // Standardized backend error body: { error, moved, errors }
    const data =
      err && typeof err === 'object' && 'response' in err
        ? ((err as { response?: { data?: { error?: string; moved?: number; errors?: MoveResponseError[] } } })
            .response?.data ?? {})
        : {}
    const moved = data.moved ?? 0
    const { fileResults, unattributed } = buildPerFileResults(state.files, plan.moves, {
      success: false,
      moved,
      errors: data.errors ?? [],
    })
    const attributedCount = fileResults.reduce((n, r) => n + (r.errors?.length ?? 0), 0)
    if (unattributed.length === 0 && attributedCount === 0) {
      unattributed.push({
        row: 0,
        error: data.error || (err instanceof Error ? err.message : '') || 'Failed to move containers',
      })
    }
    return {
      type: 'MOVE_COMPLETED',
      result: {
        success: false,
        moved,
        errors: unattributed.length > 0 ? unattributed : undefined,
        fileResults,
      },
    }
  }
}
