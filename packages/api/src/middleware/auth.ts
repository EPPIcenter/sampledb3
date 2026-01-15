import { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from '../db/client'
import { sessions, users } from '../db/schema'
import { eq, and, gt, isNull } from 'drizzle-orm'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'member' | 'viewer'
}

declare module 'hono' {
  interface ContextVariableMap {
    user?: AuthUser
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const sessionId = getCookie(c, 'session_id')
  
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const session = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(
      eq(sessions.id, sessionId),
      gt(sessions.expiresAt, Math.floor(Date.now() / 1000))
    ))
    .get()

  if (!session) {
    deleteCookie(c, 'session_id')
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const user = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(and(
      eq(users.id, session.userId),
      isNull(users.deletedAt) // Exclude soft-deleted users
    ))
    .get()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  c.set('user', user as AuthUser)
  await next()
}

export async function adminMiddleware(c: Context, next: Next) {
  // First check authentication
  await authMiddleware(c, async () => {})
  
  const user = c.get('user')
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden: Admin access required' }, 403)
  }
  
  await next()
}

export function optionalAuthMiddleware(c: Context, next: Next) {
  // Same as authMiddleware but doesn't require auth
  return authMiddleware(c, next).catch(() => next())
}
