import { eq, and, isNull } from 'drizzle-orm'
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

let dummyPasswordHash: string | null = null

/**
 * Check a password against a user's hash, or against a throwaway hash when there is no such
 * user, so a missing account takes as long to reject as a wrong password.
 */
export async function verifyPasswordConstantTime(password: string, passwordHash: string | undefined): Promise<boolean> {
  if (passwordHash) return bcrypt.compare(password, passwordHash)
  dummyPasswordHash ??= await bcrypt.hash('no-such-user', 10)
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

export async function createUserSession(
  database: Database,
  userId: number
): Promise<{ sessionId: string; expiresAt: number; maxAgeSeconds: number }> {
  const sessionSettings = await getSessionSettings(database)
  if (!sessionSettings) {
    throw new Error('Session settings are not configured. Please run database initialization.')
  }
  const maxAgeSeconds = sessionSettings.maxAgeSeconds
  const sessionId = nanoid()
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds
  await database.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  })
  return { sessionId, expiresAt, maxAgeSeconds }
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
  const passwordHash = await bcrypt.hash(data.password, 10)
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
