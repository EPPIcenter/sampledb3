import { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { sessions, users } from '../db/schema'
import { eq, and, gt, isNull } from 'drizzle-orm'
import type { Database } from '../db/client'
import { UnauthorizedError } from '../lib/error-handler'

export interface AuthUser {
  id: number
  email: string
  username?: string
  name: string
  role: 'admin' | 'member' | 'viewer'
}


// Store database in context for middleware to use
declare module 'hono' {
  interface ContextVariableMap {
    user?: AuthUser
    db?: Database // For test database injection
  }
}

export function createAuthMiddleware(database: Database) {
  return async (c: Context, next: Next) => {
    const dbToUse = database
    const sessionId = getCookie(c, 'session_id')
    
    if (!sessionId) {
      throw new UnauthorizedError('No session ID provided')
    }

    const session = await dbToUse
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
      throw new UnauthorizedError('Invalid or expired session')
    }

    const user = await dbToUse
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
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

    c.set('user', {
      id: user.id,
      email: user.email,
      username: user.username || undefined,
      name: user.name,
      role: user.role,
    } as AuthUser)
    await next()
  }
}

export function createAdminMiddleware(database: Database) {
  const auth = createAuthMiddleware(database)
  return async (c: Context, next: Next) => {
    // First check authentication
    // If auth returns a Response (e.g., 404 for user not found), return it immediately
    const authResult = await auth(c, async () => {})
    if (authResult instanceof Response) {
      return authResult
    }
    
    const user = c.get('user')
    
    if (!user) {
      throw new UnauthorizedError('User not authenticated')
    }
    
    if (user.role !== 'admin') {
      return c.json({ error: 'Forbidden: Admin access required' }, 403)
    }
    
    await next()
  }
}

export function createMemberMiddleware(database: Database) {
  const auth = createAuthMiddleware(database)
  return async (c: Context, next: Next) => {
    // First check authentication
    // If auth returns a Response (e.g., 404 for user not found), return it immediately
    const authResult = await auth(c, async () => {})
    if (authResult instanceof Response) {
      return authResult
    }
    
    const user = c.get('user')
    
    if (!user) {
      throw new UnauthorizedError('User not authenticated')
    }
    
    if (user.role !== 'admin' && user.role !== 'member') {
      return c.json({ error: 'Forbidden: Member access required' }, 403)
    }
    
    await next()
  }
}

export function createOptionalAuthMiddleware(database: Database) {
  const auth = createAuthMiddleware(database)
  return async (c: Context, next: Next) => {
    // Same as authMiddleware but doesn't require auth
    // Only catch authentication errors (UnauthorizedError), let other errors propagate
    try {
      await auth(c, next)
    } catch (error) {
      // Only suppress authentication errors - allow route to proceed without auth
      if (error instanceof UnauthorizedError) {
        await next()
      } else {
        // Re-throw database errors and other system errors to global error handler
        throw error
      }
    }
  }
}
