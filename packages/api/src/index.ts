import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import authRoutes from './routes/auth'
import studiesRoutes from './routes/studies'
import specimensRoutes from './routes/specimens'
import controlsRoutes from './routes/controls'
import reagentsRoutes from './routes/reagents'
import locationsRoutes from './routes/locations'
import exportRoutes from './routes/export'
import searchRoutes from './routes/search'
import containersRoutes from './routes/containers'
import derivationsRoutes from './routes/derivations'
import importsRoutes from './routes/imports'
import subjectsRoutes from './routes/subjects'
import activityRoutes from './routes/activity'
import collectionsRoutes from './routes/collections'
import specimenTypesRoutes from './routes/specimen-types'
import storageTypesRoutes from './routes/storage-types'
import strainsRoutes from './routes/strains'
import cellLinesRoutes from './routes/cell-lines'
import plasmidsRoutes from './routes/plasmids'
import standardsRoutes from './routes/standards'
import statisticsRoutes from './routes/statistics'
import setupRoutes from './routes/setup'
import tagsRoutes from './routes/tags'
import settingsRoutes from './routes/settings'
import unitsRoutes from './routes/units'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}))

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API routes
app.get('/api', (c) => {
  return c.json({ message: 'SampleDB API', version: '1.0.0' })
})

// Setup routes
app.route('/api/setup', setupRoutes)

// Auth routes
app.route('/api/auth', authRoutes)

// Data routes
app.route('/api/studies', studiesRoutes)
app.route('/api/specimens', specimensRoutes)
app.route('/api/blood-controls', controlsRoutes)
app.route('/api/reagents', reagentsRoutes)
app.route('/api/locations', locationsRoutes)
app.route('/api/export', exportRoutes)
app.route('/api/search', searchRoutes)
app.route('/api/containers', containersRoutes)
app.route('/api', derivationsRoutes)
app.route('/api', importsRoutes)
app.route('/api/subjects', subjectsRoutes)
app.route('/api/activity', activityRoutes)
app.route('/api/collections', collectionsRoutes)
app.route('/api/specimen-types', specimenTypesRoutes)
// States route removed - states deprecated
app.route('/api/storage-types', storageTypesRoutes)
app.route('/api/strains', strainsRoutes)
app.route('/api/cell-lines', cellLinesRoutes)
app.route('/api/plasmids', plasmidsRoutes)
app.route('/api/standards', standardsRoutes)
app.route('/api/statistics', statisticsRoutes)
app.route('/api/tags', tagsRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/units', unitsRoutes)

// Serve static files from web build in production
if (process.env.NODE_ENV === 'production') {
  const staticPath = join(__dirname, '../../web/dist')
  app.use('/*', serveStatic({ root: staticPath }))
  app.get('*', serveStatic({ path: join(staticPath, 'index.html') }))
}

const port = Number(process.env.PORT) || 3000

console.log(`🚀 SampleDB API server starting on port ${port}`)
console.log(`📁 Database: ${process.env.DATABASE_PATH || './sampledb_dev.sqlite (default)'}`)

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`✅ Server running at http://localhost:${info.port}`)
})
