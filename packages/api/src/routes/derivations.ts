import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import {
  containerDerivation,
  storageContainer,
} from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { createDerivation } from '../lib/derivations'
import { createDerivationRequestSchema, derivationDateSchema } from '../lib/derivation-schemas'
import { createAdminMiddleware, createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { requireParam, setsNoField } from '../lib/common-validators'
import { handleRouteError, ValidationError } from '../lib/error-handler'
import { enrichContainersForApi, toEnrichedContainerApi } from '../lib/container-api-enrichment'
import { loadContainerReadViews, loadContainerReadViewsByIds } from '../lib/container-read-view'
import { mapEnrichedContainerToWire } from '../lib/container-wire-mapper'

/**
 * Create derivations routes with database injection
 * @param database - Database instance (required)
 */
export function createDerivationsRoutes(database: Database): Hono {
  const derivations = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)

// Create derivation from parent container
derivations.post('/containers/:id/derive', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const body = await c.req.json()
    const input = createDerivationRequestSchema.parse(body)

    const result = await createDerivation(database, {
      parentContainerId: id,
      ...input,
    })

    const views = await loadContainerReadViews(database, [result.parentContainer, result.childContainer])
    const viewById = new Map(views.map((view) => [view.container.id, view]))
    const parentView = viewById.get(result.parentContainer.id)
    const childView = viewById.get(result.childContainer.id)
    if (!parentView || !childView) {
      throw new Error('Derived containers could not be loaded after creation')
    }

    return c.json({
      derivation: result.derivation,
      parentContainer: mapEnrichedContainerToWire(toEnrichedContainerApi(parentView)),
      childContainer: mapEnrichedContainerToWire(toEnrichedContainerApi(childView)),
      specimen: childView.specimen,
      warnings: result.warnings,
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// List derivations from a parent container
derivations.get('/containers/:id/derivations', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const derivationType = c.req.query('derivation_type') || undefined

    const where = derivationType
      ? and(
        eq(containerDerivation.parentContainerId, id),
        eq(containerDerivation.derivationType, derivationType),
      )
      : eq(containerDerivation.parentContainerId, id)

    const records = await database
      .select()
      .from(containerDerivation)
      .where(where)

    return c.json({
      derivations: records,
      count: records.length,
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get derivation source for a child container, or original source if not derived
derivations.get('/containers/:id/source', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    // First check if this container is derived
    const record = await database
      .select()
      .from(containerDerivation)
      .where(eq(containerDerivation.childContainerId, id))
      .get()

    if (record) {
      // Container is derived - return derivation source
      const views = await loadContainerReadViewsByIds(database, [record.parentContainerId])
      const parentView = views.get(record.parentContainerId)

      if (!parentView) {
        return c.json({ error: 'Parent container not found' }, 404)
      }

      return c.json({
        type: 'derivation',
        derivation: record,
        parentContainer: mapEnrichedContainerToWire(toEnrichedContainerApi(parentView)),
        parentSpecimen: parentView.specimen,
      })
    }

    // Container is not derived - return original source (subject or control)
    const views = await loadContainerReadViewsByIds(database, [id])
    const view = views.get(id)

    if (!view) {
      return c.json({ error: 'Container not found' }, 404)
    }

    if (!view.specimen) {
      return c.json({ error: 'Specimen not found for container' }, 404)
    }

    if (!view.source) {
      return c.json({ error: 'Source not found for container' }, 404)
    }

    return c.json({
      type: 'original',
      source: view.source,
      container: mapEnrichedContainerToWire(toEnrichedContainerApi(view)),
      specimen: view.specimen,
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Simple derivation chain: ancestors and direct descendants
derivations.get('/containers/:id/derivation-chain', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    // Ancestors: walk up via parent_container_id
    const ancestors: any[] = []
    let currentId: number | null = id
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- currentId can become null when walking up the chain
    while (currentId !== null) {
      const record = await database
        .select()
        .from(containerDerivation)
        .where(eq(containerDerivation.childContainerId, currentId))
        .get()
      if (!record) break

      const parent = await database
        .select()
        .from(storageContainer)
        .where(eq(storageContainer.id, record.parentContainerId))
        .get()
      if (!parent) break

      ancestors.unshift({ container: parent, derivation: record })
      currentId = record.parentContainerId
    }

    // Descendants: direct children only for now
    const descendantsRecords = await database
      .select()
      .from(containerDerivation)
      .where(eq(containerDerivation.parentContainerId, id))

    const descendants = await Promise.all(
      descendantsRecords.map(async (d) => {
        const child = await database
          .select()
          .from(storageContainer)
          .where(eq(storageContainer.id, d.childContainerId))
          .get()
        return { container: child, derivation: d }
      }),
    )

    const current = await database
      .select()
      .from(storageContainer)
      .where(eq(storageContainer.id, id))
      .get()

    const rawContainers = [
      ...ancestors.map((row) => row.container),
      ...descendants.map((row) => row.container).filter((c): c is NonNullable<typeof c> => c != null),
      ...(current ? [current] : []),
    ]

    const enrichedList = await enrichContainersForApi(database, rawContainers)
    const wireById = new Map(enrichedList.map((row) => [row.id, mapEnrichedContainerToWire(row)]))

    return c.json({
      ancestors: ancestors.map((row) => ({
        container: wireById.get(row.container.id) ?? null,
        derivation: row.derivation,
      })),
      descendants: descendants.map((row) => ({
        container: row.container ? wireById.get(row.container.id) ?? null : null,
        derivation: row.derivation,
      })),
      current: current ? wireById.get(current.id) ?? null : null,
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Update derivation metadata (admin-only: CONTEXT.md, Roles)
derivations.patch('/derivations/:id', adminMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid derivation ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      derivationDate: derivationDateSchema.optional(),
      protocol: z.string().optional(),
      notes: z.string().optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })
    const data = schema.parse(body)
    if (setsNoField(data)) {
      throw new ValidationError('Nothing to update: send derivationDate, protocol, notes or properties.')
    }

    const [updated] = await database
      .update(containerDerivation)
      .set({
        derivationDate: data.derivationDate,
        protocol: data.protocol,
        notes: data.notes,
        properties: data.properties as any,
      })
      .where(eq(containerDerivation.id, id))
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: update must return row
    if (!updated) {
      return c.json({ error: 'Derivation not found' }, 404)
    }
    return c.json({ derivation: updated })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Delete derivation (relationship only; admin-only: CONTEXT.md, Roles)
derivations.delete('/derivations/:id', adminMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid derivation ID' }, 400)
    }

    const existing = await database
      .select()
      .from(containerDerivation)
      .where(eq(containerDerivation.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Derivation not found' }, 404)
    }

    const deleted = await database
      .delete(containerDerivation)
      .where(eq(containerDerivation.id, id))
      .returning()

    if (deleted.length === 0) {
      return c.json({ error: 'Derivation not found' }, 404)
    }
    return c.json({ message: 'Derivation deleted' })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return derivations
}


