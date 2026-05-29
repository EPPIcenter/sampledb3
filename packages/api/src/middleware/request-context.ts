import type { Context, Next } from 'hono'
import { generateRequestId, logRequest } from '../lib/observability'

export const REQUEST_ID_HEADER = 'X-Request-Id'

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

export function resolveRequestId(incoming: string | undefined): string {
  const trimmed = incoming?.trim()
  if (trimmed && REQUEST_ID_PATTERN.test(trimmed)) {
    return trimmed
  }
  return generateRequestId()
}

export function getRequestId(c: Context): string | undefined {
  return c.get('requestId') as string | undefined
}

export function requestContextMiddleware() {
  return async (c: Context, next: Next) => {
    const requestId = resolveRequestId(c.req.header(REQUEST_ID_HEADER))
    c.set('requestId', requestId)
    c.header(REQUEST_ID_HEADER, requestId)

    const start = Date.now()
    await next()

    logRequest({
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      duration: Date.now() - start,
      requestId,
    })
  }
}
