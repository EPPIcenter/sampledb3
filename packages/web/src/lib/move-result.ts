/** One row a move could not apply. `row` is the 1-based position of the move in the request; 0 is request-level. */
export interface MoveRowError {
  row: number
  error: string
}

/**
 * Outcome of a Container or Collection move. `success` is true only when every move ran; a
 * best-effort move can report `moved > 0` together with `errors`, and those moves are committed.
 */
export interface MoveResult {
  success: boolean
  moved: number
  errors?: MoveRowError[]
}

/**
 * Read the result of a move request that was rejected. The API answers a move that moved
 * nothing with 400 `{ error, moved, errors }`; any other failure (network, 5xx) becomes one
 * request-level error with `moved: 0`.
 */
export function moveResultFromRejection(err: unknown, fallback: string): MoveResult {
  const data =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { error?: string; moved?: number; errors?: MoveRowError[] } } }).response?.data
      : undefined
  const errors = Array.isArray(data?.errors) && data.errors.length > 0 ? data.errors : undefined
  const message = data?.error || (err instanceof Error ? err.message : '') || fallback
  return {
    success: false,
    moved: typeof data?.moved === 'number' ? data.moved : 0,
    errors: errors ?? [{ row: 0, error: message }],
  }
}
