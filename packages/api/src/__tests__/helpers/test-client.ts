import { expect } from 'vitest'
import { Hono } from 'hono'
import { testClient } from 'hono/testing'
import type { Database } from '../../db/client'

/**
 * Creates a test client for Hono routes
 * This allows testing routes without starting a server
 */
export function createTestClient(app: Hono) {
  return testClient(app) as any
}

/**
 * Helper to create a test app with database context
 */
export function createTestAppWithDb(
  db: Database,
  routeFactory: (db: Database) => Hono
) {
  const app = new Hono()
  const route = routeFactory(db)
  app.route('/api', route)
  return createTestClient(app)
}

/**
 * Assert that a response has the expected status code
 */
export function expectStatus(response: Response, expectedStatus: number) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}. ` +
      `Response: ${JSON.stringify(response, null, 2)}`
    )
  }
}

/**
 * Assert that a response has an error message
 */
export async function expectError(response: Response, expectedMessage?: string) {
  const data = await response.json() as any
  expect(data).toHaveProperty('error')
  if (expectedMessage) {
    expect(data.error).toContain(expectedMessage)
  }
  return data
}

/**
 * Assert that a response has the expected JSON structure
 */
export async function expectJsonStructure(
  response: Response,
  structure: Record<string, any>
) {
  const data = await response.json() as any
  for (const [key, value] of Object.entries(structure)) {
    expect(data).toHaveProperty(key)
    if (value !== undefined) {
      expect(data[key]).toEqual(value)
    }
  }
  return data
}

/**
 * Unpack the data field from a standardized API response
 * This avoids the verbose data.data pattern in tests
 */
export async function getResponseData<T>(response: Response): Promise<T> {
  const json = await response.json() as any
  return json.data as T
}

/**
 * Get the full response including metadata (for cases where you need error, meta, etc.)
 */
export async function getResponse<T>(response: Response): Promise<{ data: T; meta?: any; error?: string }> {
  return await response.json() as any
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
  
  return app.request(path, {
    method,
    headers: requestHeaders,
    body: json ? JSON.stringify(json) : undefined,
  })
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
 * Create an authenticated test client (for routes requiring auth)
 * This logs in a user and returns a client with the session cookie
 * @deprecated Use loginAndGetCookie() and authenticatedRequest() instead
 */
export async function createAuthenticatedTestClient(
  app: Hono,
  db: Database,
  emailOrUsername: string,
  password: string = 'password123'
) {
  // Import here to avoid circular dependency
  const { createAuthenticatedClient } = await import('./auth-helpers')
  return createAuthenticatedClient(app, db, emailOrUsername, password)
}

