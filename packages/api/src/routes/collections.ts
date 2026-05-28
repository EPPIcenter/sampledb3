import { Hono } from 'hono'
import type { Database } from '../db/client'
import { z } from 'zod'
import { executeMoves, type BatchMoveRequest, type ContainerInfo } from '../lib/container-move'
import { executeCollectionMoves, type CollectionMoveRequest } from '../lib/collection-move'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { handleRouteError } from '../lib/error-handler'
import { deleteCollectionWithContents, preflightCollectionDelete } from '../lib/collection-delete-cascade'
import { validatePlateScan, inferPlateOrGetReport } from '../lib/plate-scan-validation'
import { requireParam } from '../lib/common-validators'
import {
  getMicronixPlateDetail,
  getCryovialBoxDetail,
  getGenericBoxDetail,
  getBagDetail,
  getSheetDetail,
} from '../lib/collections/collection-detail'
import {
  createMicronixPlate,
  createCryovialBox,
  createGenericBox,
  createBag,
  CollectionLocationNotFoundError,
  CollectionLocationNotAllowedError,
  CollectionNameExistsError,
} from '../lib/collections/collection-create'
import { listAllCollections, listCollectionsByType } from '../lib/collections/collection-list'
import {
  checkCollectionsExist,
  resolveNamedCollection,
  checkCollectionsBodySchema,
  resolveCollectionBodySchema,
  validatePlateScanBodySchema,
  createMicronixPlateBodySchema,
  createCryovialBoxBodySchema,
  createBoxBodySchema,
  createBagBodySchema,
  resolveContainersBodySchema,
  moveContainersBodySchema,
  moveSheetsBodySchema,
  moveCollectionsBodySchema,
  deleteWithContentsBodySchema,
} from '../lib/collections/collection-resolve'
import { collectionDeletePreflightSchema } from '@sampledb/contract'
import { moveSheetsToCollection, SheetMoveTargetNotFoundError } from '../lib/collections/sheet-move'
import type { CollectionType } from '../lib/collections/types'

function mapCreateCollectionError(error: unknown, c: { json: (body: unknown, status?: number) => Response }) {
  if (error instanceof CollectionLocationNotFoundError) return c.json({ error: error.message }, 404)
  if (error instanceof CollectionLocationNotAllowedError) return c.json({ error: error.message }, 400)
  if (error instanceof CollectionNameExistsError) return c.json({ error: error.message }, 400)
  return null
}

/**
 * Create collections routes with database injection
 * @param database - Database instance (required)
 */
export function createCollectionsRoutes(database: Database): Hono {
  const collections = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

  collections.get('/plates/micronix/:id', authMiddleware, async (c) => {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid plate ID' }, 400)

    const detail = await getMicronixPlateDetail(database, id)
    if (!detail) return c.json({ error: 'Plate not found' }, 404)
    return c.json(detail)
  })

  collections.post('/plates/micronix/validate-scan', authMiddleware, memberMiddleware, async (c) => {
    try {
      const data = validatePlateScanBodySchema.parse(await c.req.json())

      let plateId: number
      let inferredPlate = false

      if (data.plateId != null) {
        plateId = data.plateId
      } else {
        const inferResult = await inferPlateOrGetReport(database, {
          csvText: data.csvText,
          scannerConfigurationId: data.scannerConfigurationId,
        })
        if ('inferenceReport' in inferResult) {
          return c.json({ inferenceReport: inferResult.inferenceReport })
        }
        plateId = inferResult.plate.id
        inferredPlate = true
      }

      const result = await validatePlateScan(database, {
        csvText: data.csvText,
        plateId,
        scannerConfigurationId: data.scannerConfigurationId,
      })
      return c.json({ ...result, ...(inferredPlate && { inferredPlate: true }) })
    } catch (error) {
      if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
      if (error instanceof Error) {
        if (error.message === 'Scanner configuration not found') return c.json({ error: error.message }, 400)
        if (error.message === 'Plate not found') return c.json({ error: error.message }, 404)
        if (error.message.startsWith('Cannot infer plate:')) {
          return c.json({ error: error.message }, 400)
        }
      }
      throw error
    }
  })

  collections.get('/boxes/cryovial/:id', authMiddleware, async (c) => {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid box ID' }, 400)

    const detail = await getCryovialBoxDetail(database, id)
    if (!detail) return c.json({ error: 'Box not found' }, 404)
    return c.json(detail)
  })

  collections.get('/boxes/:id', authMiddleware, async (c) => {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid box ID' }, 400)

    const detail = await getGenericBoxDetail(database, id)
    if (!detail) return c.json({ error: 'Box not found' }, 404)
    return c.json(detail)
  })

  collections.get('/bags/:id', authMiddleware, async (c) => {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid bag ID' }, 400)

    const detail = await getBagDetail(database, id)
    if (!detail) return c.json({ error: 'Bag not found' }, 404)
    return c.json(detail)
  })

  collections.get('/sheets/:id', authMiddleware, async (c) => {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid sheet ID' }, 400)

    const detail = await getSheetDetail(database, id)
    if (!detail) return c.json({ error: 'Sheet not found' }, 404)
    return c.json(detail)
  })

  collections.post('/check', memberMiddleware, async (c) => {
    try {
      const data = checkCollectionsBodySchema.parse(await c.req.json())
      const results = await checkCollectionsExist(database, data.collections)
      return c.json({ results })
    } catch (error) {
      if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  collections.post('/resolve', authMiddleware, async (c) => {
    try {
      const data = resolveCollectionBodySchema.parse(await c.req.json())
      const result = await resolveNamedCollection(database, data.name, data.type)
      return c.json(result)
    } catch (error) {
      if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  collections.post('/plates/micronix', memberMiddleware, async (c) => {
    try {
      const data = createMicronixPlateBodySchema.parse(await c.req.json())
      const user = c.get('user')
      const result = await createMicronixPlate(database, { ...data, userId: user?.id })
      return c.json(result, 201)
    } catch (error) {
      if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
      const mapped = mapCreateCollectionError(error, c)
      if (mapped) return mapped
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  collections.post('/boxes/cryovial', memberMiddleware, async (c) => {
    try {
      const data = createCryovialBoxBodySchema.parse(await c.req.json())
      const user = c.get('user')
      const result = await createCryovialBox(database, { ...data, userId: user?.id })
      return c.json(result, 201)
    } catch (error) {
      if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
      const mapped = mapCreateCollectionError(error, c)
      if (mapped) return mapped
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  collections.post('/boxes', memberMiddleware, async (c) => {
    try {
      const data = createBoxBodySchema.parse(await c.req.json())
      const user = c.get('user')
      const result = await createGenericBox(database, { ...data, userId: user?.id })
      return c.json(result, 201)
    } catch (error) {
      if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
      const mapped = mapCreateCollectionError(error, c)
      if (mapped) return mapped
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  collections.post('/bags', memberMiddleware, async (c) => {
    try {
      const data = createBagBodySchema.parse(await c.req.json())
      const user = c.get('user')
      const result = await createBag(database, { ...data, userId: user?.id })
      return c.json(result, 201)
    } catch (error) {
      if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
      const mapped = mapCreateCollectionError(error, c)
      if (mapped) return mapped
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  collections.post('/containers/resolve', memberMiddleware, async (c) => {
    try {
      const data = resolveContainersBodySchema.parse(await c.req.json())
      const { resolveContainersByIdentifiers } = await import('../lib/container-move')
      const containers = await resolveContainersByIdentifiers(database, data.identifiers)

      const result: Array<{ identifier: unknown; container: ContainerInfo }> = []
      for (const [key, container] of containers.entries()) {
        const identifier = data.identifiers.find(
          (id) =>
            (id.type === 'barcode' && id.barcode === key) ||
            (id.type === 'position' && `${id.sourceCollectionName}:${id.sourcePosition}` === key) ||
            (id.type === 'container_id' && `container_${id.containerId}` === key),
        )
        result.push({ identifier: identifier || key, container })
      }

      return c.json({ containers: result })
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid input', details: error.issues }, 400)
      }
      console.error('Error resolving containers:', error)
      const isDevelopment = process.env.NODE_ENV !== 'production'
      const errorMessage = error instanceof Error ? error.message : 'Failed to resolve containers'
      const errorStack = error instanceof Error ? error.stack : undefined
      return c.json(
        {
          error: errorMessage,
          ...(isDevelopment && {
            details: errorMessage,
            stack: errorStack,
          }),
          ...(!isDevelopment && {
            errorCode: 'RESOLVE_CONTAINERS_ERROR',
          }),
        },
        500,
      )
    }
  })

  collections.get('/list-all', authMiddleware, async (c) => {
    try {
      const items = await listAllCollections(database)
      return c.json({ collections: items })
    } catch (error) {
      console.error('Error loading all collections:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  collections.get('/list/:type', authMiddleware, async (c) => {
    try {
      const type = requireParam(c, 'type') as CollectionType
      const result = await listCollectionsByType(database, type)
      return c.json({ collections: result })
    } catch (error) {
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  collections.post('/containers/move', memberMiddleware, async (c) => {
    try {
      const data = moveContainersBodySchema.parse(await c.req.json())
      const result = await executeMoves(database, data as BatchMoveRequest)

      if (!result.success) {
        return c.json({ error: 'Move operation failed', moved: result.moved, errors: result.errors }, 400)
      }

      return c.json({ success: true, moved: result.moved })
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid input', details: error.issues }, 400)
      }
      console.error('Error moving containers:', error)
      const isDevelopment = process.env.NODE_ENV !== 'production'
      const errorMessage = error instanceof Error ? error.message : 'Failed to move containers'
      const errorStack = error instanceof Error ? error.stack : undefined
      return c.json(
        {
          error: errorMessage,
          moved: 0,
          errors: [{ row: 0, error: errorMessage }],
          ...(isDevelopment && {
            details: errorMessage,
            stack: errorStack,
          }),
          ...(!isDevelopment && {
            errorCode: 'MOVE_CONTAINERS_ERROR',
          }),
        },
        500,
      )
    }
  })

  collections.post('/sheets/move', memberMiddleware, async (c) => {
    try {
      const data = moveSheetsBodySchema.parse(await c.req.json())
      const result = await moveSheetsToCollection(
        database,
        data.sheetIds,
        data.targetCollectionId,
        data.targetCollectionType,
      )
      return c.json({ success: true, moved: result.moved })
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid input', details: error.issues }, 400)
      }
      if (error instanceof SheetMoveTargetNotFoundError) {
        return c.json({ error: error.message }, 404)
      }
      console.error('Error moving sheets:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorName = error instanceof Error ? error.name : 'Internal server error'
      return c.json(
        {
          error: errorName,
          message: errorMessage,
        },
        500,
      )
    }
  })

  collections.post('/move', memberMiddleware, async (c) => {
    try {
      const data = moveCollectionsBodySchema.parse(await c.req.json())
      const moveResult = await executeCollectionMoves(database, data as CollectionMoveRequest)

      if (!moveResult.success) {
        return c.json(
          {
            error: 'Move operation failed',
            moved: moveResult.moved,
            errors: moveResult.errors,
          },
          400,
        )
      }

      return c.json({
        success: true,
        moved: moveResult.moved,
        errors: moveResult.errors,
      })
    } catch (error: unknown) {
      return handleRouteError(error, c)
    }
  })

  collections.post('/delete-with-contents/preflight', memberMiddleware, async (c) => {
    try {
      const parsed = deleteWithContentsBodySchema
        .pick({ collectionType: true, id: true })
        .parse(await c.req.json())
      const result = await preflightCollectionDelete(database, {
        type: parsed.collectionType,
        id: parsed.id,
      })
      return c.json(collectionDeletePreflightSchema.parse(result))
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  collections.post('/delete-with-contents', memberMiddleware, async (c) => {
    try {
      const parsed = deleteWithContentsBodySchema.parse(await c.req.json())
      const result = await deleteCollectionWithContents(database, {
        type: parsed.collectionType,
        id: parsed.id,
        removeEmptySubjects: parsed.removeEmptySubjects,
      })
      return c.json(result)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  return collections
}
