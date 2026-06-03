import { toWireJson } from '@sampledb/contract/wire'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** JSON response with omit-on-wire serialization. */
export function wireJsonResponse<T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200,
): Response {
  return c.json(toWireJson(data), status)
}
