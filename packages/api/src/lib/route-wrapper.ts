import { Context } from 'hono'
import { handleRouteError } from './error-handler'

/**
 * Wraps a route handler to automatically catch and handle errors
 * @param handler The route handler function
 * @returns A wrapped handler that catches errors
 */
export function createRouteHandler<T>(
  handler: (c: Context) => Promise<T>
) {
  return async (c: Context) => {
    try {
      const result = await handler(c)
      return result
    } catch (error) {
      return handleRouteError(error, c)
    }
  }
}

/**
 * Wraps a route handler that returns JSON, automatically catching and handling errors
 * @param handler The route handler function that returns data (not a Response)
 * @returns A wrapped handler that catches errors and returns JSON
 */
export function createJsonRouteHandler<T>(
  handler: (c: Context) => Promise<T>
) {
  return createRouteHandler(async (c: Context) => {
    const result = await handler(c)
    return c.json(result)
  })
}
