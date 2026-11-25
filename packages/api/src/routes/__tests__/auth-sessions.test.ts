import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createAuthRoutes } from '../auth'
import { sessions, users } from '../../db/schema'
import { hashSessionToken } from '../../lib/auth/auth-service'

function cookieToken(cookie: string): string {
  const match = cookie.match(/session_id=([^;]+)/)
  if (!match) throw new Error(`No session_id in ${cookie}`)
  return match[1]
}

describe('Session tokens', () => {
  let ctx: AuthenticatedRouteTestContext
  let memberId: number

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: { email: 'admin@test.com', role: 'admin' },
      additionalUsers: [{ key: 'member', email: 'member@test.com', role: 'member' }],
      mount: (app, { db }) => {
        app.route('/api/auth', createAuthRoutes(db, db))
      },
    })
    const member = await ctx.db.select().from(users).where(eq(users.email, 'member@test.com')).get()
    memberId = member!.id
  })

  afterEach(() => ctx.cleanup())

  it('stores the SHA-256 hash of the cookie token, never the token itself', async () => {
    const token = cookieToken(ctx.cookies.member)
    const rows = await ctx.db.select().from(sessions).where(eq(sessions.userId, memberId)).all()

    expect(rows).toHaveLength(1)
    expect(rows[0].tokenHash).toBe(hashSessionToken(token))
    expect(rows[0].tokenHash).not.toBe(token)
    expect(rows[0].id).not.toBe(token)
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('lists a user\'s sessions by public id with no value that works as a session cookie', async () => {
    const res = await ctx.request(`/api/auth/users/${memberId}/sessions`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sessions: Array<Record<string, unknown>> }

    expect(body.sessions).toHaveLength(1)
    expect(Object.keys(body.sessions[0]).sort()).toEqual(['expiresAt', 'id'])
    const token = cookieToken(ctx.cookies.member)
    expect(JSON.stringify(body)).not.toContain(token)
    expect(JSON.stringify(body)).not.toContain(hashSessionToken(token))

    // The listed id does not authenticate as the user.
    const asCookie = await ctx.request('/api/auth/me', { cookie: `session_id=${String(body.sessions[0].id)}` })
    expect(asCookie.status).toBe(401)
  })

  it('revokes a session by its public id, after which its cookie no longer authenticates', async () => {
    const before = await ctx.request('/api/auth/me', { cookie: ctx.cookies.member })
    expect(before.status).toBe(200)

    const list = (await (await ctx.request(`/api/auth/users/${memberId}/sessions`)).json()) as {
      sessions: Array<{ id: string }>
    }
    const res = await ctx.request(`/api/auth/sessions/${list.sessions[0].id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const after = await ctx.request('/api/auth/me', { cookie: ctx.cookies.member })
    expect(after.status).toBe(401)
    const remaining = await ctx.db.select().from(sessions).where(eq(sessions.userId, memberId)).all()
    expect(remaining).toHaveLength(0)
  })

  it('does not revoke a session when given its cookie token instead of its public id', async () => {
    const token = cookieToken(ctx.cookies.member)
    const res = await ctx.request(`/api/auth/sessions/${token}`, { method: 'DELETE' })
    expect(res.status).toBe(404)

    const after = await ctx.request('/api/auth/me', { cookie: ctx.cookies.member })
    expect(after.status).toBe(200)
  })

  it('returns 404 for an unknown user\'s sessions and 400 for a non-numeric user id', async () => {
    expect((await ctx.request('/api/auth/users/99999/sessions')).status).toBe(404)
    expect((await ctx.request('/api/auth/users/abc/sessions')).status).toBe(400)
  })

  it('forbids a member from listing or revoking sessions', async () => {
    const list = await ctx.request(`/api/auth/users/${memberId}/sessions`, { cookie: ctx.cookies.member })
    expect(list.status).toBe(403)
    const row = await ctx.db.select().from(sessions).where(eq(sessions.userId, memberId)).get()
    const revoke = await ctx.request(`/api/auth/sessions/${row!.id}`, { method: 'DELETE', cookie: ctx.cookies.member })
    expect(revoke.status).toBe(403)
  })

  it('ends the session on logout by its cookie token', async () => {
    const res = await ctx.request('/api/auth/logout', { method: 'POST', cookie: ctx.cookies.member })
    expect(res.status).toBe(200)
    const remaining = await ctx.db.select().from(sessions).where(eq(sessions.userId, memberId)).all()
    expect(remaining).toHaveLength(0)
  })
})

describe('Switch user session', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: { email: 'first@test.com', role: 'member' },
      additionalUsers: [{ key: 'second', email: 'second@test.com', role: 'member' }],
      mount: (app, { db }) => {
        app.route('/api/auth', createAuthRoutes(db, db))
      },
    })
  })

  afterEach(() => ctx.cleanup())

  it('replaces the old session with a hashed session for the target user', async () => {
    const second = await ctx.db.select().from(users).where(eq(users.email, 'second@test.com')).get()
    const res = await ctx.request('/api/auth/switch', {
      method: 'POST',
      json: { userId: second!.id, password: 'password123' },
    })
    expect(res.status).toBe(200)
    const newToken = cookieToken(res.headers.get('set-cookie') ?? '')

    expect((await ctx.request('/api/auth/me')).status).toBe(401)
    const me = await ctx.request('/api/auth/me', { cookie: `session_id=${newToken}` })
    expect(me.status).toBe(200)
    const row = await ctx.db.select().from(sessions).where(eq(sessions.tokenHash, hashSessionToken(newToken))).get()
    expect(row?.userId).toBe(second!.id)
  })
})
