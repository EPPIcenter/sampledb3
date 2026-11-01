import { eq, and, gt, isNull, ne } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import type { Database } from '../../db/client'
import { users, sessions, type users as usersTable } from '../../db/schema'
import { getSessionSettings } from '../settings'
import { UnauthorizedError, ValidationError } from '../error-handler'
import { utcNow } from '../datetime'

export type PublicUser = {
  id: number
  email: string
  username: string | null
  name: string
  role: string
}

export function toPublicUser(row: typeof usersTable.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    role: row.role,
  }
}

export async function findActiveUserByEmailOrUsername(
  database: Database,
  emailOrUsername: string
): Promise<typeof usersTable.$inferSelect | null> {
  // Email first: a username must never shadow another user's email address.
  const byEmail = await database
    .select()
    .from(users)
    .where(and(eq(users.email, emailOrUsername), isNull(users.deletedAt)))
    .get()
  if (byEmail) return byEmail
  return (
    (await database
      .select()
      .from(users)
      .where(and(eq(users.username, emailOrUsername), isNull(users.deletedAt)))
      .get()) ?? null
  )
}

/** bcrypt cost for every stored password hash, and for the throwaway hash in the login timing guard. */
export const BCRYPT_COST = 10

let dummyPasswordHash: string | null = null

/**
 * Check a password against a user's hash, or against a throwaway hash when there is no such
 * user, so a missing account takes as long to reject as a wrong password.
 */
export async function verifyPasswordConstantTime(password: string, passwordHash: string | undefined): Promise<boolean> {
  if (passwordHash) return bcrypt.compare(password, passwordHash)
  dummyPasswordHash ??= await bcrypt.hash('no-such-user', BCRYPT_COST)
  await bcrypt.compare(password, dummyPasswordHash)
  return false
}

export async function verifyLoginCredentials(
  database: Database,
  emailOrUsername: string,
  password: string
): Promise<typeof usersTable.$inferSelect> {
  const user = await findActiveUserByEmailOrUsername(database, emailOrUsername)
  const valid = await verifyPasswordConstantTime(password, user?.passwordHash)
  if (!user || !valid) {
    throw new UnauthorizedError('Invalid credentials')
  }
  if (!user.approvedAt) {
    throw new UnauthorizedError('Account pending approval')
  }
  return user
}

/**
 * SHA-256 of a session cookie token, hex encoded. The sessions table stores only this hash, so a
 * copy of the database or an admin session listing cannot be replayed as a cookie. The token has
 * 256 bits of entropy, so an unsalted fast hash is enough and keeps the lookup an indexed equality.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Start a session for a user. Returns the cookie token, which is not stored, and the session's
 * public id, which admins list and revoke by.
 */
export async function createUserSession(
  database: Database,
  userId: number,
  settingsDatabase: Database = database
): Promise<{ sessionToken: string; publicId: string; expiresAt: number; maxAgeSeconds: number }> {
  const sessionSettings = await getSessionSettings(settingsDatabase)
  if (!sessionSettings) {
    throw new Error('Session settings are not configured. Please run database initialization.')
  }
  const maxAgeSeconds = sessionSettings.maxAgeSeconds
  const sessionToken = randomBytes(32).toString('base64url')
  const publicId = nanoid()
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds
  await database.insert(sessions).values({
    id: publicId,
    tokenHash: hashSessionToken(sessionToken),
    userId,
    expiresAt,
  })
  return { sessionToken, publicId, expiresAt, maxAgeSeconds }
}

/** The unexpired session a cookie token belongs to, or null. */
export async function findActiveSessionByToken(
  database: Database,
  sessionToken: string
): Promise<{ id: string; userId: number; expiresAt: number } | null> {
  return (
    (await database
      .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(and(
        eq(sessions.tokenHash, hashSessionToken(sessionToken)),
        gt(sessions.expiresAt, Math.floor(Date.now() / 1000))
      ))
      .get()) ?? null
  )
}

/** End the session a cookie token belongs to, if any. */
export async function deleteSessionByToken(database: Database, sessionToken: string): Promise<void> {
  await database.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(sessionToken)))
}

/**
 * End all of a user's sessions, or all but the one a cookie token belongs to when `keepToken`
 * is given.
 */
export async function deleteUserSessions(
  database: Database,
  userId: number,
  keepToken?: string
): Promise<void> {
  await database
    .delete(sessions)
    .where(keepToken
      ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashSessionToken(keepToken)))
      : eq(sessions.userId, userId))
}

export async function registerApprovedUser(
  database: Database,
  data: {
    email: string
    name: string
    username?: string | null
    password: string
    role: string
  }
): Promise<typeof usersTable.$inferSelect> {
  const existingEmail = await database.select().from(users).where(eq(users.email, data.email)).get()
  if (existingEmail) {
    throw new ValidationError('Email already in use')
  }
  if (data.username) {
    const existingUsername = await database
      .select()
      .from(users)
      .where(eq(users.username, data.username))
      .get()
    if (existingUsername) {
      throw new ValidationError('Username already in use')
    }
  }
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST)
  const createdAt = utcNow()
  const [user] = await database
    .insert(users)
    .values({
      email: data.email,
      username: data.username ?? null,
      name: data.name,
      passwordHash,
      role: data.role,
      createdAt,
      approvedAt: createdAt,
    })
    .returning()
  return user
}
