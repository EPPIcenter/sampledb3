import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from 'hono/bun'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { readFile } from 'fs/promises'
import { rateLimit } from './middleware/rate-limit'
import { openOperationalDatabase } from './db/client'
import { setRequestDatabase } from './lib/db-context'
import { study } from './db/schema'
import { createAuthRoutes } from './routes/auth'
import { createStudiesRoutes } from './routes/studies'
import { createSpecimensRoutes } from './routes/specimens'
import { createControlsRoutes } from './routes/controls'
import { createSetupRoutes } from './routes/setup'
import { createSubjectsRoutes } from './routes/subjects'
import { createLocationsRoutes } from './routes/locations'
import { createReagentsRoutes } from './routes/reagents'
import { createActivityRoutes } from './routes/activity'
import { createSpecimenTypesRoutes } from './routes/specimen-types'
import { createStorageTypesRoutes } from './routes/storage-types'
import { createStrainsRoutes } from './routes/strains'
import { createCellLinesRoutes } from './routes/cell-lines'
import { createPlasmidsRoutes } from './routes/plasmids'
import { createStandardsRoutes } from './routes/standards'
import { createTagsRoutes } from './routes/tags'
import { createUnitsRoutes } from './routes/units'
import { createExportRoutes } from './routes/export'
import { createSearchRoutes } from './routes/search'
import { createContainersRoutes } from './routes/containers'
import { createDerivationsRoutes } from './routes/derivations'
import { createImportsRoutes } from './routes/imports'
import { createCollectionsRoutes } from './routes/collections'
import { createStatisticsRoutes } from './routes/statistics'
import { createSettingsRoutes } from './routes/settings'
import { createErrorLogsRoutes } from './routes/error-logs'
import { createDataAuditRoutes } from './routes/data-audit'
import { createQpcrExperimentsRoutes } from './routes/qpcr-experiments'
import { handleRouteError } from './lib/error-handler'
import { requestContextMiddleware } from './middleware/request-context'
import { getAppBuildId } from './lib/app-build-id'
import { shouldServeSpaFallback } from './lib/spa-fallback-path'
import type { Context } from 'hono'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Create database instance
const { db, sqlite } = openOperationalDatabase()

/** long-lived hashed bundles vs HTML vs other static (favicon, etc.) */
function setStaticCachePolicy(filePath: string, c: Context): void {
  const p = filePath.replace(/\\/g, '/')
  if (p.includes('/assets/') || p.includes('/_astro/')) {
    c.header('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (p.endsWith('.html') || p.endsWith('index.html')) {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  } else {
    c.header('Cache-Control', 'public, max-age=3600')
  }
}

const app = new Hono()

// Middleware
app.use('*', async (c, next) => {
  setRequestDatabase(c, db)
  await next()
})
app.use('*', requestContextMiddleware())
app.use('*', secureHeaders())
app.use('*', cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}))

// Global error handler - catches all unhandled errors
app.onError((error, c) => {
  return handleRouteError(error, c)
})

// Health check
app.get('/health', async (c) => {
  const startTime = Date.now()
  const health: {
    status: 'ok' | 'degraded' | 'error'
    timestamp: string
    uptime: number
    database: { status: 'ok' | 'error'; latency?: number }
    buildId: string
    version: string
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: { status: 'ok' },
    buildId: getAppBuildId(),
    version: '1.1.0',
  }

  // Check database connectivity
  try {
    const dbStart = Date.now()
    await db.select().from(study).limit(1)
    const dbLatency = Date.now() - dbStart
    health.database = { status: 'ok', latency: dbLatency }
    
    // Consider degraded if database is slow
    if (dbLatency > 1000) {
      health.status = 'degraded'
    }
  } catch (error) {
    health.status = 'error'
    health.database = { status: 'error' }
  }

  const responseTime = Date.now() - startTime
  const statusCode = health.status === 'error' ? 503 : health.status === 'degraded' ? 200 : 200

  return c.json(health, statusCode)
})

// API routes
app.get('/api', (c) => {
  return c.json({ message: 'SampleDB API', version: '1.1.0', buildId: getAppBuildId() })
})

// Same-origin JSON for SPA "new build available" detection (not cached; compare to import.meta.env.VITE_APP_BUILD_ID in web)
app.get('/api/app-version', (c) => {
  c.header('Cache-Control', 'no-store, must-revalidate')
  c.header('X-App-Build-Id', getAppBuildId())
  return c.json({ buildId: getAppBuildId() })
})

// OpenAPI documentation - disabled in production unless OPENAPI_ENABLED=true
const openApiEnabled =
  process.env.NODE_ENV !== 'production' || process.env.OPENAPI_ENABLED === 'true'
if (openApiEnabled) {
  app.get('/api/docs', async (c) => {
    const { openApiInfo } = await import('./lib/openapi')
    return c.json(openApiInfo)
  })
}

// Setup routes
app.route('/api/setup', createSetupRoutes(db))

// Auth routes
app.route('/api/auth', createAuthRoutes(db))

// Data routes
app.route('/api/studies', createStudiesRoutes(db, sqlite))
app.route('/api/specimens', createSpecimensRoutes(db))
app.route('/api/blood-controls', createControlsRoutes(db))
app.route('/api/reagents', createReagentsRoutes(db))
app.route('/api/locations', createLocationsRoutes(db, sqlite))
// Rate limit expensive operations
const exportApp = new Hono()
exportApp.use('*', rateLimit(60, 60 * 1000)) // 60 requests per minute (increased from 10)
exportApp.route('/', createExportRoutes(db))
app.route('/api/export', exportApp)

const searchApp = new Hono()
searchApp.use('*', rateLimit(120, 60 * 1000)) // 120 requests per minute (increased from 30)
searchApp.route('/', createSearchRoutes(db))
app.route('/api/search', searchApp)

app.route('/api/containers', createContainersRoutes(db))
app.route('/api/derivations', createDerivationsRoutes(db))

const importsApp = new Hono()
importsApp.use('*', rateLimit(30, 60 * 1000)) // 30 requests per minute (increased from 5)
importsApp.route('/', createImportsRoutes(db))
app.route('/api/imports', importsApp) // Fixed: mount at /api/imports instead of /api
app.route('/api/subjects', createSubjectsRoutes(db))
app.route('/api/activity', createActivityRoutes(db))
app.route('/api/collections', createCollectionsRoutes(db))
app.route('/api/specimen-types', createSpecimenTypesRoutes(db))
// States route removed - states deprecated
app.route('/api/storage-types', createStorageTypesRoutes(db))
app.route('/api/strains', createStrainsRoutes(db))
app.route('/api/cell-lines', createCellLinesRoutes(db))
app.route('/api/plasmids', createPlasmidsRoutes(db))
app.route('/api/standards', createStandardsRoutes(db))
app.route('/api/statistics', createStatisticsRoutes(db, sqlite))
app.route('/api/tags', createTagsRoutes(db))
app.route('/api/settings', createSettingsRoutes(db))
app.route('/api/units', createUnitsRoutes(db))
app.route('/api/error-logs', createErrorLogsRoutes(db))
app.route('/api/admin/data-audit', createDataAuditRoutes(db))
app.route('/api/qpcr-experiments', createQpcrExperimentsRoutes(db))

// Serve static files from web build in production; SPA fallback for client routes
if (process.env.NODE_ENV === 'production') {
  const webStaticPath = join(__dirname, '../../web/dist')
  const docsStaticPath = join(__dirname, '../../docs/dist')

  // Serve docs at /docs (must be before web catch-all)
  const docsRewrite = (p: string): string => {
    const sub = p.replace(/^\/docs\/?/, '')
    if (!sub) return 'index.html'
    // Astro uses directory-style routes: /docs/guides/foo/ -> guides/foo/index.html
    if (sub.endsWith('/') || !sub.includes('.')) {
      return sub.replace(/\/?$/, '') + '/index.html'
    }
    return sub
  }
  const docsStaticOpts = {
    root: docsStaticPath,
    rewriteRequestPath: docsRewrite,
    onNotFound: () => {},
    onFound: (path: string, c: Context) => setStaticCachePolicy(path, c),
  }
  app.use('/docs', serveStatic(docsStaticOpts))
  app.use('/docs/*', serveStatic(docsStaticOpts))

  // Serve any file that exists in web dist (assets/, favicon, icons, etc.); onNotFound falls through
  // rewriteRequestPath: strip leading slash so path.join doesn't treat it as absolute
  app.use(
    '*',
    serveStatic({
      root: webStaticPath,
      rewriteRequestPath: (p) => (p.startsWith('/') ? p.slice(1) : p),
      onNotFound: () => {},
      onFound: (path, c) => setStaticCachePolicy(path, c),
    }),
  )
  // SPA fallback: serve index.html when no static file found so React Router handles routing on reload
  app.get('*', async (c) => {
    const pathOnly = new URL(c.req.url).pathname
    if (!shouldServeSpaFallback(pathOnly)) {
      return c.text('Not Found', 404)
    }
    const html = await readFile(join(webStaticPath, 'index.html'), 'utf-8')
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    return c.html(html)
  })
}

const port = Number(process.env.PORT) || 3000

// Production config validation: warn if ALLOWED_ORIGINS is missing (would reject cross-origin requests)
if (process.env.NODE_ENV === 'production') {
  const origins = process.env.ALLOWED_ORIGINS?.trim()
  if (!origins || origins.length === 0) {
    console.warn(
      '⚠️  ALLOWED_ORIGINS is unset or empty in production. CORS will reject all cross-origin requests. ' +
        'Set ALLOWED_ORIGINS to your app URL (e.g. https://sampledb.example.com) in your environment.'
    )
  }
}

console.log(`🚀 SampleDB API server starting on port ${port}`)
console.log(`📁 Database: ${process.env.DATABASE_PATH || './sampledb_dev.sqlite (default)'}`)
if (process.env.ERROR_LOG_ENABLED === 'false' || process.env.ERROR_LOG_ENABLED === '0') {
  console.warn('⚠️  ERROR_LOG_ENABLED is off - errors will not be logged to the database')
}

// @ts-expect-error - Bun global is available at runtime
Bun.serve({
  fetch: app.fetch,
  port,
})

console.log(`✅ Server running at http://localhost:${port}`)
