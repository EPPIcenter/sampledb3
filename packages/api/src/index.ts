import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { rateLimit } from './middleware/rate-limit'
import { createDatabase } from './db/client'
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
import { handleRouteError } from './lib/error-handler'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Create database instance
const { db, sqlite } = createDatabase()

const app = new Hono()

// Middleware
app.use('*', logger())
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
    version: string
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: { status: 'ok' },
    version: '1.0.0',
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
  return c.json({ message: 'SampleDB API', version: '1.0.0' })
})

// OpenAPI documentation
// Note: Install @hono/swagger-ui for full Swagger UI support
// For now, returns OpenAPI JSON schema
app.get('/api/docs', async (c) => {
  const { openApiInfo } = await import('./lib/openapi')
  return c.json(openApiInfo)
})

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
app.route('/api', createDerivationsRoutes(db))

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

// Serve static files from web build in production
if (process.env.NODE_ENV === 'production') {
  const staticPath = join(__dirname, '../../web/dist')
  app.use('/*', serveStatic({ root: staticPath }))
  app.get('*', serveStatic({ path: join(staticPath, 'index.html') }))
}

const port = Number(process.env.PORT) || 3000

console.log(`🚀 SampleDB API server starting on port ${port}`)
console.log(`📁 Database: ${process.env.DATABASE_PATH || './sampledb_dev.sqlite (default)'}`)

// @ts-expect-error - Bun global is available at runtime
Bun.serve({
  fetch: app.fetch,
  port,
})

console.log(`✅ Server running at http://localhost:${port}`)
