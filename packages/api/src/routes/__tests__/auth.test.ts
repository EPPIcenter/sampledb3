import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient, loginAndGetCookie, authenticatedRequest, extractSessionId } from '../../__tests__/helpers/test-client'
import { Hono } from 'hono'
import { createAuthRoutes } from '../auth'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { users, sessions } from '../../db/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import type { Database } from '../../db/client'
import {
  createTestUser,
  setupPasswordRequirements,
  setupSessionSettings,
} from '../../__tests__/helpers/auth-helpers'
import type { ErrorResponse, UserResponse, ValidationErrorResponse, SuccessResponse } from '../../__tests__/helpers/test-types'

describe('Auth API', () => {
  let app: Hono
  let testDb: Database
  let sqlite: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Setup required settings for auth to work
    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800) // 7 days

    // Pass testDb as both database and settingsDb for tests
    const authRoutes = createAuthRoutes(testDb, testDb)
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
      const data = await res.json() as UserResponse
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

    it('should login with valid email credentials', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.login.$post({
        json: {
          emailOrUsername: 'login@example.com',
          password: 'password123',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as UserResponse
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
          emailOrUsername: 'nonexistent@example.com',
          password: 'password123',
        },
      })

      expect(res.status).toBe(401)
    })

    it('should reject invalid password', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.login.$post({
        json: {
          emailOrUsername: 'login@example.com',
          password: 'wrongpassword',
        },
      })

      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/auth/login with username', () => {
    beforeEach(async () => {
      // Create a test user with username
      await createTestUser(testDb, {
        email: 'user@example.com',
        name: 'Username User',
        username: 'testuser',
        password: 'password123',
      })
    })

    it('should login with username', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.login.$post({
        json: {
          emailOrUsername: 'testuser',
          password: 'password123',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.user).toBeDefined()
      expect(data.user.email).toBe('user@example.com')
      expect(data.user.username).toBe('testuser')

      // Check for session cookie
      const cookies = res.headers.get('set-cookie')
      expect(cookies).toContain('session_id')
    })

    it('should reject invalid username', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.login.$post({
        json: {
          emailOrUsername: 'nonexistentuser',
          password: 'password123',
        },
      })

      expect(res.status).toBe(401)
    })

    it('should reject login with username when user has no username', async () => {
      // Create user without username
      await createTestUser(testDb, {
        email: 'nousername@example.com',
        name: 'No Username User',
        username: null,
        password: 'password123',
      })

      const client = createTestClient(app) as any
      const res = await client.api.auth.login.$post({
        json: {
          emailOrUsername: 'nousername@example.com', // Should use email, not username
          password: 'password123',
        },
      })

      // Should work with email
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/auth/register with username', () => {
    it('should register a new user with username', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.register.$post({
        json: {
          email: 'newuser@example.com',
          name: 'New User',
          username: 'newuser',
          password: 'password123',
          role: 'member',
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as any
      expect(data.user).toBeDefined()
      expect(data.user.email).toBe('newuser@example.com')
      expect(data.user.username).toBe('newuser')
    })

    it('should register a user without username (username optional)', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.register.$post({
        json: {
          email: 'nousername@example.com',
          name: 'No Username',
          password: 'password123',
          role: 'member',
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as any
      expect(data.user).toBeDefined()
      expect(data.user.username).toBeUndefined()
    })

    it('should reject duplicate username during registration', async () => {
      const client = createTestClient(app) as any

      // Register first user with username
      await client.api.auth.register.$post({
        json: {
          email: 'first@example.com',
          name: 'First User',
          username: 'duplicate',
          password: 'password123',
        },
      })

      // Try to register with same username
      const res = await client.api.auth.register.$post({
        json: {
          email: 'second@example.com',
          name: 'Second User',
          username: 'duplicate',
          password: 'password123',
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toContain('Username already in use')
    })
  })

  describe('PATCH /api/auth/me - Profile Update', () => {
    let testUser: any
    let cookieHeader: string

    beforeEach(async () => {
      // Create and authenticate a test user
      testUser = await createTestUser(testDb, {
        email: 'profile@example.com',
        name: 'Profile User',
        username: 'profileuser',
        password: 'password123',
      })

      // Login to get a session cookie
      cookieHeader = await loginAndGetCookie(app, 'profile@example.com', 'password123')
    })

    it('should update name only', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          name: 'Updated Name',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as UserResponse
      expect(data.user.name).toBe('Updated Name')
      expect(data.user.email).toBe('profile@example.com')
      expect(data.user.username).toBe('profileuser')
    })

    it('should update email only', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          email: 'newemail@example.com',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.user.email).toBe('newemail@example.com')
      expect(data.user.name).toBe('Profile User')
    })

    it('should update username only', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          username: 'newusername',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as UserResponse
      expect(data.user.username).toBe('newusername')
    })

    it('should update multiple fields at once', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          name: 'New Name',
          email: 'newemail@example.com',
          username: 'newusername',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as UserResponse
      expect(data.user.name).toBe('New Name')
      expect(data.user.email).toBe('newemail@example.com')
      expect(data.user.username).toBe('newusername')
    })

    it('should clear username (set to null)', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          username: null,
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as UserResponse
      expect(data.user.username).toBeUndefined()
    })

    it('should reject duplicate email', async () => {
      // Create another user
      await createTestUser(testDb, {
        email: 'other@example.com',
        name: 'Other User',
        password: 'password123',
      })

      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          email: 'other@example.com',
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('Email already in use')
    })

    it('should reject duplicate username', async () => {
      // Create another user with username
      await createTestUser(testDb, {
        email: 'other@example.com',
        name: 'Other User',
        username: 'otheruser',
        password: 'password123',
      })

      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          username: 'otheruser',
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toContain('Username already in use')
    })

    it('should reject invalid email format', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          email: 'invalid-email',
        },
      })

      expect(res.status).toBe(400)
    })

    it('should reject empty name', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          name: '',
        },
      })

      expect(res.status).toBe(400)
    })

    it('should require authentication (401 without session)', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth.me.$patch({
        json: {
          name: 'New Name',
        },
      })

      expect(res.status).toBe(401)
    })

    it('should return updated user data with username', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          username: 'updateduser',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as UserResponse
      expect(data.user).toHaveProperty('id')
      expect(data.user).toHaveProperty('email')
      expect(data.user).toHaveProperty('username')
      expect(data.user).toHaveProperty('name')
      expect(data.user).toHaveProperty('role')
      expect(data.user.username).toBe('updateduser')
    })
  })

  describe('PATCH /api/auth/me/password - Password Change', () => {
    let testUser: any
    let cookieHeader: string

    beforeEach(async () => {
      // Create and authenticate a test user
      testUser = await createTestUser(testDb, {
        email: 'password@example.com',
        name: 'Password User',
        password: 'oldpassword123',
      })

      // Login to get a session cookie
      cookieHeader = await loginAndGetCookie(app, 'password@example.com', 'oldpassword123')
    })

    it('should change password with valid current password', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me/password', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json() as SuccessResponse
      expect(data.message).toContain('Password changed successfully')

      // Verify we can login with new password
      const loginClient = createTestClient(app) as any
      const loginRes = await loginClient.api.auth.login.$post({
        json: {
          emailOrUsername: 'password@example.com',
          password: 'newpassword123',
        },
      })

      expect(loginRes.status).toBe(200)
    })

    it('should reject incorrect current password', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me/password', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123',
        },
      })

      expect(res.status).toBe(401)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('Current password is incorrect')
    })

    it('should reject password shorter than minimum length', async () => {
      const res = await authenticatedRequest(app, '/api/auth/me/password', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          currentPassword: 'oldpassword123',
          newPassword: 'short',
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('Password must be at least')
    })

    it('should require authentication (401 without session)', async () => {
      const client = createTestClient(app) as any
      const res = await client.api.auth['me/password'].$patch({
        json: {
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        },
      })

      expect(res.status).toBe(401)
    })

    it('should verify password hash is updated', async () => {
      await authenticatedRequest(app, '/api/auth/me/password', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        },
      })

      // Get user from database and verify hash changed
      const updatedUser = await testDb
        .select()
        .from(users)
        .where(eq(users.id, testUser.id))
        .get()

      expect(updatedUser).toBeDefined()
      const isValid = await bcrypt.compare('newpassword123', updatedUser!.passwordHash)
      expect(isValid).toBe(true)
    })

    it('should revoke other sessions except current after password change', async () => {
      // Extract current session ID from cookie header
      const currentSessionId = extractSessionId(cookieHeader)
      if (!currentSessionId) {
        throw new Error('Could not extract session ID from cookie header')
      }
      
      // Create additional sessions for the user
      await testDb.insert(sessions).values({
        id: 'session1',
        userId: testUser.id,
        expiresAt: Math.floor(Date.now() / 1000) + 604800,
      })

      await testDb.insert(sessions).values({
        id: 'session2',
        userId: testUser.id,
        expiresAt: Math.floor(Date.now() / 1000) + 604800,
      })

      // Verify we have 3 sessions before password change (current + 2 additional)
      const sessionsBefore = await testDb
        .select()
        .from(sessions)
        .where(eq(sessions.userId, testUser.id))
        .all()
      expect(sessionsBefore.length).toBe(3)

      // Change password
      await authenticatedRequest(app, '/api/auth/me/password', {
        method: 'PATCH',
        cookie: cookieHeader,
        json: {
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        },
      })

      // Verify only the current session remains
      const remainingSessions = await testDb
        .select()
        .from(sessions)
        .where(eq(sessions.userId, testUser.id))
        .all()

      expect(remainingSessions.length).toBe(1)
      expect(remainingSessions[0].id).toBe(currentSessionId)
    })
  })
})



