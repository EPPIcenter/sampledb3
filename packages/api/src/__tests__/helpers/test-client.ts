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
 * Create an authenticated test client (for routes requiring auth)
 * Note: This is a placeholder - implement based on your auth setup
 */
export function createAuthenticatedTestClient(app: Hono, userId: number = 1) {
  // TODO: Add authentication headers/cookies to test client
  // This would require setting up session cookies or auth tokens
  return testClient(app)
}

