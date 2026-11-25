const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000']

/**
 * Allowed browser origins for the API (CORS on regular routes, Origin validation on /api/mcp).
 */
export function getAllowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (process.env.NODE_ENV === 'production') {
    return configured
  }

  return configured.length > 0 ? configured : DEFAULT_DEV_ORIGINS
}

/** True for the MCP endpoint path, which grants browsers no CORS access. */
export function isMcpEndpointPath(pathname: string): boolean {
  return pathname === '/api/mcp' || pathname.startsWith('/api/mcp/')
}

/** Exact origin match against the allowed origin list. */
export function isOriginAllowed(origin: string, allowedOrigins: readonly string[]): boolean {
  const normalized = origin.trim()
  if (!normalized) return false
  return allowedOrigins.includes(normalized)
}
