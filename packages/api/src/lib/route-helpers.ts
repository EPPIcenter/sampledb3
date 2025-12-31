/**
 * Common route helper utilities
 */

/**
 * Parse and validate an ID parameter from the route
 * Returns null if invalid
 */
export function parseId(idParam: string | undefined): number | null {
  if (!idParam) return null
  const id = parseInt(idParam)
  return isNaN(id) ? null : id
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  error: string,
  status: number = 400,
  details?: any
): Response {
  return new Response(
    JSON.stringify({
      error,
      ...(details && { details }),
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * Create a standardized success response
 */
export function successResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}



