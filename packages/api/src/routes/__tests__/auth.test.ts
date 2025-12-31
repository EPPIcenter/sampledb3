import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient } from '../../__tests__/helpers/test-client'
import { Hono } from 'hono'
import { createAuthRoutes } from '../auth'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { users } from '../../db/schema'
import bcrypt from 'bcryptjs'
import type { Database } from '../../db/client'

describe('Auth API', () => {
  let app: Hono
  let testDb: Database
  let sqlite: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    const authRoutes = createAuthRoutes(testDb)
    app = new Hono()
    app.route('/api/auth', authRoutes)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.register.$post({
        json: {
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
          role: 'member',
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.user).toBeDefined()
      expect(data.user.email).toBe('test@example.com')
      expect(data.user.name).toBe('Test User')
      expect(data.user).not.toHaveProperty('passwordHash')
    })

    it('should reject invalid email', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.register.$post({
        json: {
          email: 'invalid-email',
          name: 'Test User',
          password: 'password123',
        },
      })

      expect(res.status).toBe(400)
    })

    it('should reject short password', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.register.$post({
        json: {
          email: 'test@example.com',
          name: 'Test User',
          password: 'short',
        },
      })

      expect(res.status).toBe(400)
    })

    it('should reject duplicate email', async () => {
      const client = createTestClient(app) as any

      // Register first user
      await client.api.auth.register.$post({
        json: {
          email: 'duplicate@example.com',
          name: 'User 1',
          password: 'password123',
        },
      })

      // Try to register with same email
      const res = await client.api.auth.register.$post({
        json: {
          email: 'duplicate@example.com',
          name: 'User 2',
          password: 'password123',
        },
      })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const passwordHash = await bcrypt.hash('password123', 10)
      await testDb.insert(users).values({
        email: 'login@example.com',
        name: 'Login Test User',
        passwordHash,
        role: 'member',
        createdAt: new Date().toISOString(),
      })
    })

    it('should login with valid credentials', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.login.$post({
        json: {
          email: 'login@example.com',
          password: 'password123',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.user).toBeDefined()
      expect(data.user.email).toBe('login@example.com')

      // Check for session cookie
      const cookies = res.headers.get('set-cookie')
      expect(cookies).toContain('session_id')
    })

    it('should reject invalid email', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.login.$post({
        json: {
          email: 'nonexistent@example.com',
          password: 'password123',
        },
      })

      expect(res.status).toBe(401)
    })

    it('should reject invalid password', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.login.$post({
        json: {
          email: 'login@example.com',
          password: 'wrongpassword',
        },
      })

      expect(res.status).toBe(401)
    })
  })
})



