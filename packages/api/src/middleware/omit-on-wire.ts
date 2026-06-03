import type { Context, Next } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { toWireJson } from '@sampledb/contract/wire'

/** Apply omit-on-wire serialization to successful JSON response bodies. */
export async function omitOnWireMiddleware(c: Context, next: Next): Promise<void> {
  await next()

  const res = c.res
  if (res.status >= 400) {
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
