import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { users, sessions } from '../db/schema'
import { eq, and, isNull, gt, ne } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import type { Database } from '../db/client'
import { getPasswordRequirements, getSessionSettings } from '../lib/settings'
import { authMiddleware, adminMiddleware } from '../middleware/auth'

export function createAuthRoutes(database: Database) {
  const auth = new Hono()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Dynamic register schema - password min length will be set based on settings
const createRegisterSchema = async () => {
  const passwordRequirements = await getPasswordRequirements()
  if (!passwordRequirements) {
    throw new Error('Password requirements are not configured. Please run database initialization.')
  }
  const minLength = passwordRequirements.minLength
  return z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(minLength),
    role: z.enum(['admin', 'member', 'viewer']).default('member'),
  })
}

// Login
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const { email, password } = loginSchema.parse(body)

    const user = await database
      .select()
      .from(users)
      .where(and(
        eq(users.email, email),
        isNull(users.deletedAt) // Exclude soft-deleted users
      ))
      .get()

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    // Get session settings
    const sessionSettings = await getSessionSettings()
    if (!sessionSettings) {
      return c.json({ error: 'Session settings are not configured. Please run database initialization.' }, 500)
    }
    const maxAgeSeconds = sessionSettings.maxAgeSeconds

    // Create session
    const sessionId = nanoid()
    const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds

    await database.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt,
    })

    // Update last login
    await database
      .update(users)
      .set({ lastLogin: new Date().toISOString() })
      .where(eq(users.id, user.id))

    setCookie(c, 'session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeSeconds,
      path: '/',
    })

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Logout
auth.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id')
  if (sessionId) {
    await database.delete(sessions).where(eq(sessions.id, sessionId))
  }
  deleteCookie(c, 'session_id')
  return c.json({ message: 'Logged out' })
})

// Get current user (requires authentication)
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user')!
  return c.json({ user })
})

// Register (admin only in production)
auth.post('/register', async (c) => {
  try {
    const body = await c.req.json()
    const registerSchema = await createRegisterSchema()
    const data = registerSchema.parse(body)

    // Check if user exists
    const existing = await database
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .get()

    if (existing) {
      return c.json({ error: 'User already exists' }, 400)
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10)

    // Create user
    const [user] = await database
      .insert(users)
      .values({
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role,
      })
      .returning()

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
  })

// Get current user (alias for /me for consistency, requires authentication)
auth.get('/current', authMiddleware, async (c) => {
  const user = c.get('user')!
  return c.json({ user })
})

// List all users (admin only, requires authentication)
auth.get('/users', adminMiddleware, async (c) => {
  try {
    const includeDeleted = c.req.query('includeDeleted') === 'true'
    
    let query = database
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin,
        deletedAt: users.deletedAt,
      })
      .from(users)
    
    // Exclude soft-deleted users unless explicitly requested
    if (!includeDeleted) {
      query = query.where(isNull(users.deletedAt)) as any
    }
    
    const allUsers = await query.orderBy(users.name)
    
    return c.json({ users: allUsers })
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Switch user (for shared workstations - requires password confirmation and authentication)
auth.post('/switch', authMiddleware, async (c) => {
  try {
    const currentUser = c.get('user')!
    const body = await c.req.json()
    const schema = z.object({
      userId: z.number().int(),
      password: z.string().min(1),
    })
    
    const { userId, password } = schema.parse(body)
    
    // Get the target user (exclude soft-deleted)
    const targetUser = await database
      .select()
      .from(users)
      .where(and(
        eq(users.id, userId),
        isNull(users.deletedAt)
      ))
      .get()
    
    if (!targetUser) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    // Verify password for the target user
    const valid = await bcrypt.compare(password, targetUser.passwordHash)
    if (!valid) {
      return c.json({ error: 'Invalid password' }, 401)
    }
    
    // Get session settings
    const sessionSettings = await getSessionSettings()
    if (!sessionSettings) {
      return c.json({ error: 'Session settings are not configured. Please run database initialization.' }, 500)
    }
    const maxAgeSeconds = sessionSettings.maxAgeSeconds
    
    // Delete old session
    const sessionId = getCookie(c, 'session_id')
    if (sessionId) {
      await database.delete(sessions).where(eq(sessions.id, sessionId))
    }
    
    // Create new session for target user
    const newSessionId = nanoid()
    const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds
    
    await database.insert(sessions).values({
      id: newSessionId,
      userId: targetUser.id,
      expiresAt,
    })
    
    // Update last login
    await database
      .update(users)
      .set({ lastLogin: new Date().toISOString() })
      .where(eq(users.id, targetUser.id))
    
    setCookie(c, 'session_id', newSessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeSeconds,
      path: '/',
    })
    
    return c.json({
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Update user (admin only)
auth.put('/users/:id', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid user ID' }, 400)
    }

    const body = await c.req.json()
    const updateSchema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      role: z.enum(['admin', 'member', 'viewer']).optional(),
    })
    const data = updateSchema.parse(body)

    // Check if user exists (including soft-deleted for admin operations)
    const existing = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'User not found' }, 404)
    }

    // If email is being updated, check for duplicates (excluding soft-deleted users)
    if (data.email && data.email !== existing.email) {
      const duplicate = await database
        .select()
        .from(users)
        .where(and(
          eq(users.email, data.email),
          isNull(users.deletedAt)
        ))
        .get()

      if (duplicate) {
        return c.json({ error: 'Email already in use' }, 400)
      }
    }

    // Prevent removing the last admin
    if (data.role && data.role !== 'admin' && existing.role === 'admin') {
      const adminCount = await database
        .select({ count: z.number() })
        .from(users)
        .where(and(
          eq(users.role, 'admin'),
          isNull(users.deletedAt)
        ))
        .then(rows => rows.length)

      if (adminCount <= 1) {
        return c.json({ error: 'Cannot remove the last admin' }, 400)
      }
    }

    const [updated] = await database
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning()

    return c.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        createdAt: updated.createdAt,
        lastLogin: updated.lastLogin,
        deletedAt: updated.deletedAt,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Reset user password (admin only)
auth.patch('/users/:id/password', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid user ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      password: z.string().min(1),
    })
    const { password } = schema.parse(body)

    // Get password requirements
    const passwordRequirements = await getPasswordRequirements()
    if (!passwordRequirements) {
      return c.json({ error: 'Password requirements are not configured' }, 500)
    }

    if (password.length < passwordRequirements.minLength) {
      return c.json({ 
        error: `Password must be at least ${passwordRequirements.minLength} characters` 
      }, 400)
    }

    // Check if user exists
    const existing = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10)

    await database
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, id))

    // Revoke all existing sessions for this user
    await database.delete(sessions).where(eq(sessions.userId, id))

    return c.json({ message: 'Password reset successfully' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Soft delete user (admin only)
auth.delete('/users/:id', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid user ID' }, 400)
    }

    // Check if user exists
    const existing = await database
      .select()
      .from(users)
      .where(and(
        eq(users.id, id),
        isNull(users.deletedAt)
      ))
      .get()

    if (!existing) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Prevent deleting the last admin
    if (existing.role === 'admin') {
      const adminCount = await database
        .select()
        .from(users)
        .where(and(
          eq(users.role, 'admin'),
          isNull(users.deletedAt)
        ))
        .then(rows => rows.length)

      if (adminCount <= 1) {
        return c.json({ error: 'Cannot delete the last admin' }, 400)
      }
    }

    // Soft delete: set deletedAt timestamp
    const deletedAt = new Date().toISOString()
    await database
      .update(users)
      .set({ deletedAt })
      .where(eq(users.id, id))

    // Revoke all existing sessions for this user
    await database.delete(sessions).where(eq(sessions.userId, id))

    return c.json({ message: 'User deleted successfully' })
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Restore soft-deleted user (admin only)
auth.post('/users/:id/restore', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid user ID' }, 400)
    }

    // Check if user exists and is soft-deleted
    const existing = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'User not found' }, 404)
    }

    if (!existing.deletedAt) {
      return c.json({ error: 'User is not deleted' }, 400)
    }

    // Check if email is still available (not taken by another active user)
    const emailConflict = await database
      .select()
      .from(users)
      .where(and(
        eq(users.email, existing.email),
        isNull(users.deletedAt),
        ne(users.id, id)
      ))
      .get()

    if (emailConflict) {
      return c.json({ 
        error: 'Cannot restore user: email is already in use by another user' 
      }, 400)
    }

    // Restore: clear deletedAt
    await database
      .update(users)
      .set({ deletedAt: null })
      .where(eq(users.id, id))

    const [restored] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    return c.json({
      user: {
        id: restored.id,
        email: restored.email,
        name: restored.name,
        role: restored.role,
        createdAt: restored.createdAt,
        lastLogin: restored.lastLogin,
        deletedAt: restored.deletedAt,
      },
    })
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get active sessions for a user (admin only)
auth.get('/users/:id/sessions', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid user ID' }, 400)
    }

    // Check if user exists
    const user = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .get()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    const now = Math.floor(Date.now() / 1000)
    const activeSessions = await database
      .select({
        id: sessions.id,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(and(
        eq(sessions.userId, id),
        gt(sessions.expiresAt, now)
      ))

    return c.json({ sessions: activeSessions })
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Revoke a session (admin only)
auth.delete('/sessions/:id', adminMiddleware, async (c) => {
  try {
    const sessionId = c.req.param('id')

    const deleted = await database
      .delete(sessions)
      .where(eq(sessions.id, sessionId))
      .returning()

    if (deleted.length === 0) {
      return c.json({ error: 'Session not found' }, 404)
    }

    return c.json({ message: 'Session revoked successfully' })
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

  return auth
}

// Default export removed - routes must be created with database injection via createAuthRoutes()
// This will be handled in index.ts
