import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from '../db/client'
import { users, sessions } from '../db/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import type { Database } from '../db/client'
import { getPasswordRequirements, getSessionSettings } from '../lib/settings'

export function createAuthRoutes(database: Database = db) {
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

// Get current user
auth.get('/me', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
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

  return auth
}

const auth = createAuthRoutes()
export default auth
