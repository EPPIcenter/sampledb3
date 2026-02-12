import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { users, sessions } from '../db/schema'
import { eq, and, isNull, gt, ne, or, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import type { Database } from '../db/client'
import { getPasswordRequirements, getSessionSettings } from '../lib/settings'
import { createAuthMiddleware, createAdminMiddleware } from '../middleware/auth'
import { rateLimit } from '../middleware/rate-limit'
import { handleRouteError } from '../lib/error-handler'

export function createAuthRoutes(database: Database, settingsDb?: Database) {
  const auth = new Hono()
  // Use settingsDb if provided (for tests), otherwise use the passed database
  const dbForSettings = settingsDb || database
  
  // Create middleware with the test database
  const authMiddleware = createAuthMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)

  // Helper to get password requirements from the correct database
  const getPasswordRequirementsFromDb = async () => {
    const dbForSettings = settingsDb || database
    return await getPasswordRequirements(dbForSettings)
  }

  // Helper to get session settings from the correct database
  const getSessionSettingsFromDb = async () => {
    const dbForSettings = settingsDb || database
    return await getSessionSettings(dbForSettings)
  }

const loginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1),
})

// Dynamic register schema - password min length will be set based on settings
const createRegisterSchema = async () => {
  const passwordRequirements = await getPasswordRequirementsFromDb()
  if (!passwordRequirements) {
    throw new Error('Password requirements are not configured. Please run database initialization.')
  }
  const minLength = passwordRequirements.minLength
  return z.object({
    email: z.string().email(),
    name: z.string().min(1),
    username: z.string().min(1).optional().nullable(),
    password: z.string().min(minLength),
    role: z.enum(['admin', 'member', 'viewer']).default('member'),
  })
}

// Login - rate limited for brute force protection (10 attempts per minute per IP)
auth.post('/login', rateLimit(10, 60 * 1000), async (c) => {
  try {
    const body = await c.req.json()
    const { emailOrUsername, password } = loginSchema.parse(body)

    // Try to find user by email or username
    const user = await database
      .select()
      .from(users)
      .where(and(
        or(
          eq(users.email, emailOrUsername),
          eq(users.username, emailOrUsername)
        ),
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

    if (!user.approvedAt) {
      return c.json({ error: 'Account pending approval' }, 401)
    }

    // Get session settings
    const sessionSettings = await getSessionSettingsFromDb()
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
        username: user.username || undefined,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return handleRouteError(error, c)
  }
})

// Self-register (public, rate-limited) - creates user with approvedAt=null
const createSelfRegisterSchema = async () => {
  const passwordRequirements = await getPasswordRequirementsFromDb()
  if (!passwordRequirements) {
    throw new Error('Password requirements are not configured. Please run database initialization.')
  }
  const minLength = passwordRequirements.minLength
  return z.object({
    email: z.string().email(),
    name: z.string().min(1),
    username: z.string().min(1).optional().nullable(),
    password: z.string().min(minLength),
  })
}

auth.post('/self-register', rateLimit(5, 60 * 1000), async (c) => {
  try {
    const body = await c.req.json()
    const schema = await createSelfRegisterSchema()
    const data = schema.parse(body)

    const existingEmail = await database
      .select()
      .from(users)
      .where(and(eq(users.email, data.email), isNull(users.deletedAt)))
      .get()

    if (existingEmail) {
      return c.json({ error: 'Email already in use' }, 400)
    }

    if (data.username) {
      const existingUsername = await database
        .select()
        .from(users)
        .where(and(eq(users.username, data.username), isNull(users.deletedAt)))
        .get()

      if (existingUsername) {
        return c.json({ error: 'Username already in use' }, 400)
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 10)
    const createdAt = new Date().toISOString()

    const [user] = await database
      .insert(users)
      .values({
        email: data.email,
        username: data.username || null,
        name: data.name,
        passwordHash,
        role: 'member',
        createdAt,
        approvedAt: null, // Pending admin approval
      })
      .returning()

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username || undefined,
        name: user.name,
        role: user.role,
      },
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return handleRouteError(error, c)
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
  // Fetch full user data including username
  const fullUser = await database
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .get()
  
  if (!fullUser) {
    return c.json({ error: 'User not found' }, 404)
  }
  
  return c.json({ 
    user: {
      id: fullUser.id,
      email: fullUser.email,
      username: fullUser.username || undefined,
      name: fullUser.name,
      role: fullUser.role,
    }
  })
})

// Register (admin only in production)
auth.post('/register', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const registerSchema = await createRegisterSchema()
    const data = registerSchema.parse(body)

    // Check if email already exists
    const existingEmail = await database
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .get()

    if (existingEmail) {
      return c.json({ error: 'Email already in use' }, 400)
    }

    // Check if username already exists (if provided)
    if (data.username) {
      const existingUsername = await database
        .select()
        .from(users)
        .where(eq(users.username, data.username))
        .get()

      if (existingUsername) {
        return c.json({ error: 'Username already in use' }, 400)
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10)
    const createdAt = new Date().toISOString()

    // Create user (admin-created users are immediately approved)
    const [user] = await database
      .insert(users)
      .values({
        email: data.email,
        username: data.username || null,
        name: data.name,
        passwordHash,
        role: data.role,
        createdAt,
        approvedAt: createdAt,
      })
      .returning()

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username || undefined,
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
  try {
    const user = c.get('user')!
    // Fetch full user data including username
    const fullUser = await database
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .get()
    
    if (!fullUser) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    return c.json({ 
      user: {
        id: fullUser.id,
        email: fullUser.email,
        username: fullUser.username || undefined,
        name: fullUser.name,
        role: fullUser.role,
      }
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Update current user profile (self-service)
auth.patch('/me', authMiddleware, async (c) => {
  try {
    const currentUser = c.get('user')!
    const body = await c.req.json()
    const updateSchema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      username: z.string().min(1).optional().nullable(),
    })
    const data = updateSchema.parse(body)

    // Get current user from database
    const existing = await database
      .select()
      .from(users)
      .where(eq(users.id, currentUser.id))
      .get()

    if (!existing) {
      return c.json({ error: 'User not found' }, 404)
    }

    // If email is being updated, check for duplicates (excluding current user)
    if (data.email && data.email !== existing.email) {
      const duplicate = await database
        .select()
        .from(users)
        .where(and(
          eq(users.email, data.email),
          isNull(users.deletedAt),
          ne(users.id, currentUser.id)
        ))
        .get()

      if (duplicate) {
        return c.json({ error: 'Email already in use' }, 400)
      }
    }

    // If username is being updated, check for duplicates (excluding current user)
    if (data.username !== undefined) {
      // Allow setting username to null (clearing it)
      if (data.username !== null && data.username !== existing.username) {
        const duplicate = await database
          .select()
          .from(users)
          .where(and(
            eq(users.username, data.username),
            isNull(users.deletedAt),
            ne(users.id, currentUser.id)
          ))
          .get()

        if (duplicate) {
          return c.json({ error: 'Username already in use' }, 400)
        }
      }
    }

    const [updated] = await database
      .update(users)
      .set(data)
      .where(eq(users.id, currentUser.id))
      .returning()

    return c.json({
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username || undefined,
        name: updated.name,
        role: updated.role,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Change current user password (self-service)
auth.patch('/me/password', authMiddleware, async (c) => {
  try {
    const currentUser = c.get('user')!
    const body = await c.req.json()
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(1),
    })
    const { currentPassword, newPassword } = schema.parse(body)

    // Get password requirements
    const passwordRequirements = await getPasswordRequirementsFromDb()
    if (!passwordRequirements) {
      return c.json({ error: 'Password requirements are not configured' }, 500)
    }

    if (newPassword.length < passwordRequirements.minLength) {
      return c.json({ 
        error: `Password must be at least ${passwordRequirements.minLength} characters` 
      }, 400)
    }

    // Get current user from database
    const existing = await database
      .select()
      .from(users)
      .where(eq(users.id, currentUser.id))
      .get()

    if (!existing) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, existing.passwordHash)
    if (!valid) {
      return c.json({ error: 'Current password is incorrect' }, 401)
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10)

    await database
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, currentUser.id))

    // Revoke all existing sessions except the current one for security
    const sessionId = getCookie(c, 'session_id')
    if (sessionId) {
      await database
        .delete(sessions)
        .where(and(
          eq(sessions.userId, currentUser.id),
          ne(sessions.id, sessionId)
        ))
    } else {
      // If no session cookie, revoke all sessions
      await database.delete(sessions).where(eq(sessions.userId, currentUser.id))
    }

    return c.json({ message: 'Password changed successfully' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// List all users (admin only, requires authentication)
auth.get('/users', adminMiddleware, async (c) => {
  try {
    const includeDeleted = c.req.query('includeDeleted') === 'true'
    
    let query = database
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin,
        deletedAt: users.deletedAt,
        approvedAt: users.approvedAt,
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

    if (!targetUser.approvedAt) {
      return c.json({ error: 'Account pending approval' }, 401)
    }
    
    // Verify password for the target user
    const valid = await bcrypt.compare(password, targetUser.passwordHash)
    if (!valid) {
      return c.json({ error: 'Invalid password' }, 401)
    }
    
    // Get session settings
    const sessionSettings = await getSessionSettingsFromDb()
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
        username: targetUser.username || undefined,
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
      username: z.string().min(1).optional().nullable(),
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
          isNull(users.deletedAt),
          ne(users.id, id)
        ))
        .get()

      if (duplicate) {
        return c.json({ error: 'Email already in use' }, 400)
      }
    }

    // If username is being updated, check for duplicates (excluding soft-deleted users)
    if (data.username !== undefined) {
      // Allow setting username to null (clearing it)
      if (data.username !== null && data.username !== existing.username) {
        const duplicate = await database
          .select()
          .from(users)
          .where(and(
            eq(users.username, data.username),
            isNull(users.deletedAt),
            ne(users.id, id)
          ))
          .get()

        if (duplicate) {
          return c.json({ error: 'Username already in use' }, 400)
        }
      }
    }

    // Prevent removing the last admin
    if (data.role && data.role !== 'admin' && existing.role === 'admin') {
      const countResult = await database
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(and(
          eq(users.role, 'admin'),
          isNull(users.deletedAt)
        ))
      const adminCount = Number(countResult[0]?.count ?? 0)
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
        username: updated.username || undefined,
        name: updated.name,
        role: updated.role,
        createdAt: updated.createdAt,
        lastLogin: updated.lastLogin,
        deletedAt: updated.deletedAt,
        approvedAt: updated.approvedAt ?? undefined,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Approve user (admin only) - allows pending self-registered users to log in
auth.patch('/users/:id/approve', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid user ID' }, 400)
    }

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

    const approvedAt = new Date().toISOString()
    await database
      .update(users)
      .set({ approvedAt })
      .where(eq(users.id, id))

    return c.json({
      user: {
        id: existing.id,
        email: existing.email,
        username: existing.username || undefined,
        name: existing.name,
        role: existing.role,
        approvedAt,
      },
    })
  } catch (error) {
    return handleRouteError(error, c)
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
    const passwordRequirements = await getPasswordRequirementsFromDb()
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
        username: restored.username || undefined,
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
