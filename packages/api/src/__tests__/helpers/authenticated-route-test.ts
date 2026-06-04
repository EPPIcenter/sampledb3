import { Hono } from 'hono'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import type { Database } from '../../db/client'
import { setRequestDatabase } from '../../lib/db-context'
import { handleRouteError } from '../../lib/error-handler'
import { omitOnWireMiddleware } from '../../middleware/omit-on-wire'
import { createAuthRoutes } from '../../routes/auth'
import {
  createTestUser,
  setupPaginationSettings,
  setupPasswordRequirements,
  setupSessionSettings,
  type CreateTestUserOptions,
} from './auth-helpers'
import { cleanupTestDatabase, setupTestDatabase } from './db-setup'
import { authenticatedRequest, loginAndGetCookie } from './test-client'

export interface RouteTestContext {
  db: Database
  sqlite: SQLiteDatabase
}

export interface AdditionalRouteTestUser extends Partial<CreateTestUserOptions> {
  key: string
  email: string
}

export interface SetupAuthenticatedRouteTestOptions {
  /** Omit when tests mount routes per request via createRequestApp(extraMount) */
  mount?: (app: Hono, ctx: RouteTestContext) => void
  /**
   * Runs after DB + auth settings (password/session/pagination), before the default test user is created.
   * Use for seed data that must exist before login (e.g. studies, locations).
   */
  seed?: (ctx: RouteTestContext) => Promise<void>
  user?: Partial<CreateTestUserOptions>
  additionalUsers?: AdditionalRouteTestUser[]
  settings?: {
    pagination?: boolean
  }
}

export interface AuthenticatedRouteTestRequestOptions {
  method?: string
  json?: unknown
  headers?: Record<string, string>
  /** Omit for default user cookie; pass null for unauthenticated requests */
  cookie?: string | null
}

export interface AuthenticatedRouteTestContext extends RouteTestContext {
  cookie: string
  cookies: Record<string, string>
  createRequestApp: (extraMount?: (app: Hono, ctx: RouteTestContext) => void) => Hono
  request: (path: string, options?: AuthenticatedRouteTestRequestOptions) => Promise<Response>
  cleanup: () => void
}

/**
 * Sets up an in-memory DB, auth settings, test user(s), real login, and a request-app factory
 * for route integration tests.
 */
export async function setupAuthenticatedRouteTest(
  options: SetupAuthenticatedRouteTestOptions
): Promise<AuthenticatedRouteTestContext> {
  const { db, sqlite } = await setupTestDatabase()

  await setupPasswordRequirements(db, 8)
  await setupSessionSettings(db, 604800)
  if (options.settings?.pagination) {
    await setupPaginationSettings(db)
  }

  const routeCtx: RouteTestContext = { db, sqlite }
  await options.seed?.(routeCtx)

  const defaultUser = {
    email: options.user?.email ?? 'user@test.com',
    name: options.user?.name ?? 'User',
    password: options.user?.password ?? 'password123',
    role: options.user?.role ?? ('member' as const),
  }

  await createTestUser(db, {
    email: defaultUser.email,
    name: defaultUser.name,
    password: defaultUser.password,
    role: defaultUser.role,
  })

  for (const additional of options.additionalUsers ?? []) {
    await createTestUser(db, {
      email: additional.email,
      name: additional.name ?? additional.key,
      password: additional.password ?? 'password123',
      role: additional.role ?? 'member',
      username: additional.username,
      approvedAt: additional.approvedAt,
    })
  }

  const loginApp = new Hono()
  loginApp.use('*', async (c, next) => {
    setRequestDatabase(c, db)
    await next()
  })
  loginApp.route('/api/auth', createAuthRoutes(db, db))

  const cookie = await loginAndGetCookie(loginApp, defaultUser.email, defaultUser.password)

  const cookies: Record<string, string> = {}
  for (const additional of options.additionalUsers ?? []) {
    cookies[additional.key] = await loginAndGetCookie(
      loginApp,
      additional.email,
      additional.password ?? 'password123'
    )
  }

  const createRequestApp = (extraMount?: (app: Hono, ctx: RouteTestContext) => void) => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      setRequestDatabase(c, db)
      await next()
    })
    app.onError((err, c) => handleRouteError(err, c))
    app.use('*', omitOnWireMiddleware)
    options.mount?.(app, routeCtx)
    extraMount?.(app, routeCtx)
    return app
  }

  const request = (path: string, requestOptions: AuthenticatedRouteTestRequestOptions = {}) => {
    const app = createRequestApp()
    const cookieHeader =
      requestOptions.cookie === null
        ? undefined
        : (requestOptions.cookie ?? cookie)

    return authenticatedRequest(app, path, {
      method: requestOptions.method,
      json: requestOptions.json,
      headers: requestOptions.headers,
      cookie: cookieHeader,
    })
  }

  return {
    db,
    sqlite,
    cookie,
    cookies,
    createRequestApp,
    request,
    cleanup: () => cleanupTestDatabase(sqlite),
  }
}
