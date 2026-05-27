import { expect } from 'vitest'
import { Hono } from 'hono'
import { testClient } from 'hono/testing'

/**
 * Creates a test client for Hono routes (no server required).
 */
export function createTestClient(app: Hono) {
  return testClient(app) as any
}

/**
 * Unpack the data field from a standardized API response
 * This avoids the verbose data.data pattern in tests
 */
interface ApiResponseWrapper<T> {
  data: T
  meta?: unknown
  error?: never
}

export async function getResponseData<T>(response: Response): Promise<T> {
  const json = await response.json() as ApiResponseWrapper<T>
  return json.data
}

/**
 * Get the full response including metadata (for cases where you need error, meta, etc.)
 */
interface ApiResponseWithMeta<T> {
  data: T
  meta?: {
    pagination?: unknown
    filters?: unknown
  }
  error?: never
}

export async function getResponse<T>(response: Response): Promise<ApiResponseWithMeta<T>> {
  return await response.json() as ApiResponseWithMeta<T>
}

/**
 * Extract session ID from Set-Cookie header or cookie header string
 * Handles both formats:
 * - Set-Cookie header: "session_id=abc123; Path=/; HttpOnly"
 * - Cookie header: "session_id=abc123"
 * Returns the session ID value or null if not found
 */
export function extractSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null
  }
  
  // Handle multiple cookies (Set-Cookie can be an array or comma-separated)
  const cookies = Array.isArray(cookieHeader) 
    ? cookieHeader 
    : cookieHeader.split(',').map(c => c.trim())
  
  for (const cookie of cookies) {
    // Match session_id=value (value can be followed by ; or end of string)
    const match = cookie.match(/session_id=([^;\s]+)/)
    if (match) {
      return match[1]
    }
  }
  
  return null
}

/**
 * Create a cookie header string from a session ID
 */
export function createCookieHeader(sessionId: string): string {
  return `session_id=${sessionId}`
}

/**
 * Make an authenticated request to the app
 * This is a convenience wrapper around app.request() that handles cookies
 */
export function authenticatedRequest(
  app: Hono,
  path: string,
  options: {
    method?: string
    cookie?: string
    json?: any
    headers?: Record<string, string>
  } = {}
): Promise<Response> {
  const { method = 'GET', cookie, json, headers = {} } = options
  
  const requestHeaders: Record<string, string> = {
    ...headers,
  }
  
  if (cookie) {
    requestHeaders['Cookie'] = cookie
  }
  
  if (json) {
    requestHeaders['Content-Type'] = 'application/json'
  }
  
  return Promise.resolve(app.request(path, {
    method,
    headers: requestHeaders,
    body: json ? JSON.stringify(json) : undefined,
  }))
}

/**
 * Login a user and return the session cookie
 * This is a convenience function that logs in and extracts the cookie
 */
export async function loginAndGetCookie(
  app: Hono,
  emailOrUsername: string,
  password: string = 'password123'
): Promise<string> {
  const client = createTestClient(app) as any
  const loginRes = await client.api.auth.login.$post({
    json: {
      emailOrUsername,
      password,
    },
  })
  
  if (loginRes.status !== 200) {
    const errorBody = await loginRes.json().catch(() => ({}))
    throw new Error(`Login failed: ${loginRes.status} - ${JSON.stringify(errorBody)}`)
  }
  
  const setCookieHeader = loginRes.headers.get('set-cookie')
  const sessionId = extractSessionId(setCookieHeader)
  
  if (!sessionId) {
    throw new Error('No session cookie in login response')
  }
  
  return createCookieHeader(sessionId)
}

/**
 * Create an authenticated wrapper around a test client
 * This automatically adds the Cookie header to all requests
 * 
 * @param client - The base test client
 * @param cookieHeader - The cookie header string (e.g., "session_id=abc123")
 * @returns A wrapped client that automatically includes the cookie in all requests
 */
export function createAuthenticatedClientWrapper(
  client: ReturnType<typeof createTestClient>,
  cookieHeader: string
): ReturnType<typeof createTestClient> {
  // Create a proxy that intercepts method calls
  return new Proxy(client, {
    get(target, prop) {
      const value = (target as any)[prop]
      
      // If it's a function that looks like a request method ($get, $post, etc.)
      if (typeof value === 'function' && typeof prop === 'string' && prop.startsWith('$')) {
        return function(...args: any[]) {
          // The first argument is typically an options object
          const options = args[0] || {}
          
          // Merge in the cookie header
          const headers = options.headers || {}
          const mergedHeaders = {
            ...headers,
            Cookie: cookieHeader,
          }
          
          // Call the original method with updated options
          return value.call(target, {
            ...options,
            headers: mergedHeaders,
          })
        }
      }
      
      // If it's an object (like client.api), recursively wrap it
      if (value && typeof value === 'object' && !Array.isArray(value) && value !== null) {
        return createAuthenticatedClientWrapper(value as any, cookieHeader)
      }
      
      return value
    },
  }) as any
}