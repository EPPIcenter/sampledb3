import type { Database } from '../../db/client'
import { users, sessions, settings } from '../../db/schema'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import type { Hono } from 'hono'
import { testClient } from 'hono/testing'
import { eq, and, isNull } from 'drizzle-orm'

export interface CreateTestUserOptions {
  email: string
  name: string
  password?: string
  username?: string | null
  role?: 'admin' | 'member' | 'viewer' // Defaults to 'member'
}

/**
 * Create a test user in the database
 * 
 * Role permissions:
 * - 'admin': Full access (create, read, update, delete everything)
 * - 'member': Can create/edit/delete data (subjects, specimens, etc.) but NOT reference data
 * - 'viewer': Read-only access to everything
 */
export async function createTestUser(
  db: Database,
  options: CreateTestUserOptions
) {
  const passwordHash = await bcrypt.hash(options.password || 'password123', 10)
  
  const [user] = await db.insert(users).values({
    email: options.email,
    name: options.name,
    passwordHash,
    username: options.username || null,
    role: options.role || 'member',
    createdAt: new Date().toISOString(),
  }).returning()

  return user
}

/**
 * Get password requirements from test database
 */
export async function getTestPasswordRequirements(db: Database): Promise<{ minLength: number } | null> {
  const setting = await db
    .select()
    .from(settings)
    .where(and(eq(settings.key, 'password_requirements'), isNull(settings.userId)))
    .get()

  if (!setting) {
    return null
  }

  return setting.value as { minLength: number }
}

/**
 * Get session settings from test database
 */
export async function getTestSessionSettings(db: Database): Promise<{ maxAgeSeconds: number } | null> {
  const setting = await db
    .select()
    .from(settings)
    .where(and(eq(settings.key, 'session_settings'), isNull(settings.userId)))
    .get()

  if (!setting) {
    return null
  }

  return setting.value as { maxAgeSeconds: number }
}

/**
 * Setup password requirements for tests (uses test database)
 */
export async function setupPasswordRequirements(db: Database, minLength: number = 8) {
  await db
    .insert(settings)
    .values({
      key: 'password_requirements',
      userId: null,
      value: { minLength },
    })
    .onConflictDoUpdate({
      target: [settings.key, settings.userId],
      set: {
        value: { minLength },
      },
    })
}

/**
 * Setup session settings for tests (uses test database)
 */
export async function setupSessionSettings(db: Database, maxAgeSeconds: number = 604800) {
  await db
    .insert(settings)
    .values({
      key: 'session_settings',
      userId: null,
      value: { maxAgeSeconds },
    })
    .onConflictDoUpdate({
      target: [settings.key, settings.userId],
      set: {
        value: { maxAgeSeconds },
      },
    })
}

/**
 * Create an authenticated session for a user
 * Returns the session ID and cookie string
 */
export async function createAuthenticatedSession(
  db: Database,
  userId: number,
  maxAgeSeconds: number = 604800
) {
  const sessionId = nanoid()
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  })

  // Return session cookie in format expected by Hono test client
  return {
    sessionId,
    cookie: `session_id=${sessionId}`,
    cookieHeader: `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
  }
}

/**
 * Create a test user and authenticate them, returning session info
 */
export async function createTestUserWithSession(
  db: Database,
  options: CreateTestUserOptions,
  maxAgeSeconds: number = 604800
) {
  const user = await createTestUser(db, options)
  const session = await createAuthenticatedSession(db, user.id as number, maxAgeSeconds)
  
  return {
    user,
    session,
  }
}

/**
 * Login a user and return a test client with the session cookie
 * This actually calls the login endpoint to get a real session
 */
export async function createAuthenticatedClient(
  app: Hono,
  db: Database,
  emailOrUsername: string,
  password: string = 'password123'
) {
  // First, login to get a session
  const client = testClient(app) as any
  const loginRes = await client.api.auth.login.$post({
    json: {
      emailOrUsername,
      password,
    },
  })

  if (loginRes.status !== 200) {
    const errorBody = await loginRes.json().catch(() => ({}))
    throw new Error(`Failed to login: ${loginRes.status} - ${JSON.stringify(errorBody)}`)
  }

  // Extract session cookie from response
  const setCookieHeader = loginRes.headers.get('set-cookie')
  if (!setCookieHeader) {
    throw new Error('No session cookie in login response')
  }

  // Extract just the session_id value
  const sessionIdMatch = setCookieHeader.match(/session_id=([^;]+)/)
  if (!sessionIdMatch) {
    throw new Error('Could not extract session_id from cookie')
  }
  const sessionId = sessionIdMatch[1]

  // Note: Session should be created by the login endpoint
  // We don't verify here to avoid timing issues - the test will verify if needed

  // Return the base client and sessionId
  // Tests will need to manually add Cookie header
  const baseClient = testClient(app) as any
  baseClient._sessionId = sessionId
  // Cookie header format: just "name=value", not the full Set-Cookie string
  baseClient._cookieHeader = `session_id=${sessionId}`
  
  return baseClient
}
