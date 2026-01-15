import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { users, sessions } from '../db/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import type { Database } from '../db/client'
import { getPasswordRequirements, getSessionSettings } from '../lib/settings'
import { authMiddleware } from '../middleware/auth'

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
      .where(eq(users.email, email))
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
auth.get('/users', authMiddleware, async (c) => {
  const currentUser = c.get('user')!
  
  if (currentUser.role !== 'admin') {
    return c.json({ error: 'Forbidden: Admin access required' }, 403)
  }
  
  try {
    const allUsers = await database
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .orderBy(users.name)
    
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
    
    // Get the target user
    const targetUser = await database
      .select()
      .from(users)
      .where(eq(users.id, userId))
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

  return auth
}

// Default export removed - routes must be created with database injection via createAuthRoutes()
// This will be handled in index.ts
