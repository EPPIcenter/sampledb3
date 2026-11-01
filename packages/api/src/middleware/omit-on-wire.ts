import type { Context, Next } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { toWireJson } from '@sampledb/contract/wire'

declare module 'hono' {
  interface ContextVariableMap {
    /** Set by `keepNullsOnWire`: send this response's nulls instead of omitting them. */
    keepNullsOnWire?: boolean
  }
}

/**
 * Send this response's null values as they are. Only a JSON Container export calls this,
 * so that every row of the file has the same keys; every other response omits nulls.
 */
export function keepNullsOnWire(c: Context): void {
  c.set('keepNullsOnWire', true)
}

/** Apply omit-on-wire serialization to successful JSON response bodies. */
export async function omitOnWireMiddleware(c: Context, next: Next): Promise<void> {
  await next()

  const res = c.res
  if (res.status >= 400 || c.get('keepNullsOnWire')) {
    return
  }

  const contentType = res.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    return
  }

  try {
    const body = await res.clone().json()
    c.res = c.json(toWireJson(body), res.status as ContentfulStatusCode)
  } catch {
    // Non-JSON or empty body — leave response unchanged
  }
}
