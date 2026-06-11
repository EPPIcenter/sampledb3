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
    file.csvRows.forEach((row) => {
      const identifier = variant.identifierFromRow(row)
      if (identifier === null) return
      moves.push({ identifier, targetPosition: row.target_position.trim(), fileIndex })
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

/**
 * Map the move response back onto files. Error-to-file attribution is by
 * row range, as the move endpoint does not echo file boundaries.
 */
export function buildPerFileResults(
  files: ScanMoveFile[],
  moves: ScanMovePlannedMove[],
  response: { success: boolean; errors?: Array<{ row: number; error: string }> },
): ScanMovePerFileResult[] {
  return files.map((file, fileIndex) => {
    const fileMoves = moves.filter((m) => m.fileIndex === fileIndex)
    return {
      filename: file.filename,
      destinationName: file.selectedDestinationName ?? '',
      moved: response.success ? fileMoves.length : 0,
      errors: response.errors?.filter((e) => e.row > 0 && e.row <= file.csvRows.length),
    }
  })
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
    return {
      type: 'MOVE_COMPLETED',
      result: {
        success: response.success,
        moved: response.moved || 0,
        errors: response.success ? undefined : response.errors,
        fileResults: buildPerFileResults(state.files, plan.moves, response),
      },
    }
  } catch (err) {
    // Standardized backend error body: { error, moved, errors }
    const data =
      err && typeof err === 'object' && 'response' in err
        ? ((err as { response?: { data?: { error?: string; moved?: number; errors?: ScanMoveValidationError[] } } })
            .response?.data ?? {})
        : {}
    const errors: ScanMoveValidationError[] = data.errors ?? []
    if (errors.length === 0) {
      errors.push({
        row: 0,
        error: data.error || (err instanceof Error ? err.message : '') || 'Failed to move containers',
      })
    }
    return {
      type: 'MOVE_COMPLETED',
      result: { success: false, moved: data.moved ?? 0, errors },
    }
  }
}
