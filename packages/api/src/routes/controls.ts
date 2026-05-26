import { Hono } from 'hono'
import type { Database } from '../db/client'
import {
  controlDefinition,
  controlBatch,
  strain,
  unit,
  specimen,
  storageContainer,
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, like, desc, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { parseControlProperties } from '../lib/control-properties'
import { validateControlBatchName, generateUniqueBatchName } from '../lib/validation'
import { generateControlDefinitionName, generateUniqueControlDefinitionName } from '../lib/control-name-generation'
import { handleRouteError, NotFoundError } from '../lib/error-handler'
import type { BloodControlProperties } from '../types/properties'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'
import { requireParam } from '../lib/common-validators'
import { deleteBloodControlBatch, deleteSpecimenFromBatch } from '../lib/controls/batch-delete'
import { createBloodControlBatch } from '../lib/controls/batch-create'
import { validateControlBatchCsv } from '../lib/controls/batch-csv-validate'
import {
  createBloodControlBatchSchema,
  createBatchWithSpecimensSchema,
  addSpecimensToBatchSchema,
  validateControlBatchCsvSchema,
} from '../lib/controls/batch-schemas'
import {
  createBatchWithSpecimens,
  addSpecimensToBatch,
} from '../lib/controls/batch-with-specimens'
import { getBloodControlBatchSummary } from '../lib/controls/batch-summary'
import { getBloodControlDefinitionSummary } from '../lib/controls/definition-summary'
import {
  strainCompositionEntrySchema,
  resolveStrainComposition,
  findBloodControlDefinitionByComposition,
  findMatchingDefinitionInList,
  buildBloodControlPropertiesPayload,
} from '../lib/controls/strain-composition'

/**
 * Create controls routes with database injection
 * @param database - Database instance (required)
 */
export function createControlsRoutes(database: Database): Hono {
  const dbInstance = database
  const controls = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

  // --- Control Batches ---

// List all control batches
controls.get('/batches', authMiddleware, async (c) => {
  const spotCountSubquery = dbInstance
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`SUM(${storageContainer.remainingQuantity})`.as('spot_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(paper, eq(storageContainer.id, paper.id))
    .groupBy(specimen.controlBatchId)
    .as('spot_counts')

  const micronixCountSubquery = dbInstance
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('micronix_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(micronixTube, eq(storageContainer.id, micronixTube.id))
    .groupBy(specimen.controlBatchId)
    .as('micronix_counts')

  const cryovialCountSubquery = dbInstance
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('cryovial_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(cryovialTube, eq(storageContainer.id, cryovialTube.id))
    .groupBy(specimen.controlBatchId)
    .as('cryovial_counts')

  const staticWellCountSubquery = dbInstance
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('static_well_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(staticWell, eq(storageContainer.id, staticWell.id))
    .groupBy(specimen.controlBatchId)
    .as('static_well_counts')

  const tubeCountSubquery = dbInstance
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('tube_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .where(
      sql`EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
          EXISTS (SELECT 1 FROM cryovial_tube WHERE cryovial_tube.id = ${storageContainer.id}) OR
          EXISTS (SELECT 1 FROM static_well WHERE static_well.id = ${storageContainer.id})`
    )
    .groupBy(specimen.controlBatchId)
    .as('tube_counts')

  const specimenCountSubquery = dbInstance
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('specimen_count'),
    })
    .from(specimen)
    .groupBy(specimen.controlBatchId)
    .as('specimen_counts')

  // Strains are now stored in properties JSON, so we'll parse them in the response

  const batchesResults = await dbInstance
    .select({
      id: controlBatch.id,
      controlDefinitionId: controlBatch.controlDefinitionId,
      name: controlBatch.name,
      productionDate: controlBatch.productionDate,
      created: controlBatch.created,
      lastUpdated: controlBatch.lastUpdated,
      definitionName: controlDefinition.name,
      controlType: controlDefinition.controlType,
      properties: controlDefinition.properties,
      specimenCount: sql<number>`COALESCE(${specimenCountSubquery.count}, 0)`,
      spotCount: sql<number>`COALESCE(${spotCountSubquery.count}, 0)`,
      micronixCount: sql<number>`COALESCE(${micronixCountSubquery.count}, 0)`,
      cryovialCount: sql<number>`COALESCE(${cryovialCountSubquery.count}, 0)`,
      staticWellCount: sql<number>`COALESCE(${staticWellCountSubquery.count}, 0)`,
      tubeCount: sql<number>`COALESCE(${tubeCountSubquery.count}, 0)`,
      inventoryTotal: sql<number>`COALESCE(${spotCountSubquery.count}, 0) + COALESCE(${tubeCountSubquery.count}, 0)`,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .leftJoin(specimenCountSubquery, eq(controlBatch.id, specimenCountSubquery.batchId))
    .leftJoin(spotCountSubquery, eq(controlBatch.id, spotCountSubquery.batchId))
    .leftJoin(micronixCountSubquery, eq(controlBatch.id, micronixCountSubquery.batchId))
    .leftJoin(cryovialCountSubquery, eq(controlBatch.id, cryovialCountSubquery.batchId))
    .leftJoin(staticWellCountSubquery, eq(controlBatch.id, staticWellCountSubquery.batchId))
    .leftJoin(tubeCountSubquery, eq(controlBatch.id, tubeCountSubquery.batchId))
    .where(eq(controlDefinition.controlType, 'blood'))
    .orderBy(desc(controlBatch.created))

  // Parse strains from properties JSON
  const batches = batchesResults.map(row => {
    const props = row.properties as any
    const strains = props?.strains || []
    return {
      ...row,
      strains: strains.map((s: any) => typeof s === 'number' ? { id: s } : s),
      targetDensity: props?.targetDensity,
      unitSymbol: props?.targetDensityUnit?.symbol || props?.targetDensityUnitSymbol,
    }
  })

  return c.json({ batches })
})

// Get batch detail (only for blood control batches)
controls.get('/batches/:id', authMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

  const result = await dbInstance
    .select({
      batch: controlBatch,
      definition: controlDefinition,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .where(and(
      eq(controlBatch.id, id),
      eq(controlDefinition.controlType, 'blood')
    ))
    .get()

  if (!result) throw new NotFoundError('Blood control batch', id)

  return c.json({ batch: result.batch })
})

// Update batch (rename, change production date, etc.)
controls.patch('/batches/:id', memberMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

  try {
    const batchWithDefinition = await dbInstance
      .select({ batch: controlBatch, definition: controlDefinition })
      .from(controlBatch)
      .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
      .where(and(eq(controlBatch.id, id), eq(controlDefinition.controlType, 'blood')))
      .get()

    if (!batchWithDefinition) {
      return c.json({ error: 'Blood control batch not found' }, 404)
    }

    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).max(255).optional(),
      productionDate: z.string().optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })
    const data = schema.parse(body)

    if (data.name) {
      const validation = await validateControlBatchName(dbInstance, data.name, id)
      if (!validation.valid) {
        return c.json({ error: validation.error, suggestion: validation.suggestion }, 400)
      }
    }

    const user = c.get('user')
    const updates: Record<string, unknown> = {
      lastUpdated: utcNow(),
      updatedBy: user?.id,
    }
    if (data.name !== undefined) updates.name = data.name
    if (data.productionDate !== undefined) updates.productionDate = data.productionDate
    if (data.properties !== undefined) updates.properties = data.properties

    const [updated] = await dbInstance
      .update(controlBatch)
      .set(updates)
      .where(eq(controlBatch.id, id))
      .returning()

    return c.json({ batch: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return handleRouteError(error, c)
  }
})

// Delete batch and all associated data
controls.delete('/batches/:id', memberMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

  try {
    await deleteBloodControlBatch(dbInstance, id)
    return c.json({ message: 'Batch deleted successfully' })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get batch summary with enriched specimen data
controls.get('/batches/:id/summary', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

    const result = await getBloodControlBatchSummary(dbInstance, id)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// --- Control Definitions ---// --- Control Definitions ---

// List all control definitions (filtered to blood controls)
controls.get('/', authMiddleware, async (c) => {
  const batchCountSubquery = dbInstance
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('batch_count'),
    })
    .from(controlBatch)
    .groupBy(controlBatch.controlDefinitionId)
    .as('batch_counts')

  const specimenCountSubquery = dbInstance
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('specimen_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .groupBy(controlBatch.controlDefinitionId)
    .as('specimen_counts')

  const spotCountSubquery = dbInstance
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`SUM(${storageContainer.remainingQuantity})`.as('spot_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(paper, eq(storageContainer.id, paper.id))
    .groupBy(controlBatch.controlDefinitionId)
    .as('spot_counts')

  const micronixCountSubquery = dbInstance
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('micronix_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(micronixTube, eq(storageContainer.id, micronixTube.id))
    .groupBy(controlBatch.controlDefinitionId)
    .as('micronix_counts')

  const cryovialCountSubquery = dbInstance
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('cryovial_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(cryovialTube, eq(storageContainer.id, cryovialTube.id))
    .groupBy(controlBatch.controlDefinitionId)
    .as('cryovial_counts')

  const staticWellCountSubquery = dbInstance
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('static_well_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(staticWell, eq(storageContainer.id, staticWell.id))
    .groupBy(controlBatch.controlDefinitionId)
    .as('static_well_counts')

  const tubeCountSubquery = dbInstance
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('tube_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .where(
      sql`EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
          EXISTS (SELECT 1 FROM cryovial_tube WHERE cryovial_tube.id = ${storageContainer.id}) OR
          EXISTS (SELECT 1 FROM static_well WHERE static_well.id = ${storageContainer.id})`
    )
    .groupBy(controlBatch.controlDefinitionId)
    .as('tube_counts')

  // Get all strains for name lookup
  const allStrains = await dbInstance.select().from(strain)
  const strainMap = new Map(allStrains.map(s => [s.id, { name: s.name }]))

  const query = dbInstance
    .select({
      id: controlDefinition.id,
      name: controlDefinition.name,
      controlType: controlDefinition.controlType,
      properties: controlDefinition.properties,
      created: controlDefinition.created,
      lastUpdated: controlDefinition.lastUpdated,
      batchCount: sql<number>`COALESCE(${batchCountSubquery.count}, 0)`,
      specimenCount: sql<number>`COALESCE(${specimenCountSubquery.count}, 0)`,
      spotCount: sql<number>`COALESCE(${spotCountSubquery.count}, 0)`,
      micronixCount: sql<number>`COALESCE(${micronixCountSubquery.count}, 0)`,
      cryovialCount: sql<number>`COALESCE(${cryovialCountSubquery.count}, 0)`,
      staticWellCount: sql<number>`COALESCE(${staticWellCountSubquery.count}, 0)`,
      tubeCount: sql<number>`COALESCE(${tubeCountSubquery.count}, 0)`,
      inventoryTotal: sql<number>`COALESCE(${spotCountSubquery.count}, 0) + COALESCE(${tubeCountSubquery.count}, 0)`,
    })
    .from(controlDefinition)
    .leftJoin(batchCountSubquery, eq(controlDefinition.id, batchCountSubquery.definitionId))
    .leftJoin(specimenCountSubquery, eq(controlDefinition.id, specimenCountSubquery.definitionId))
    .leftJoin(spotCountSubquery, eq(controlDefinition.id, spotCountSubquery.definitionId))
    .leftJoin(micronixCountSubquery, eq(controlDefinition.id, micronixCountSubquery.definitionId))
    .leftJoin(cryovialCountSubquery, eq(controlDefinition.id, cryovialCountSubquery.definitionId))
    .leftJoin(staticWellCountSubquery, eq(controlDefinition.id, staticWellCountSubquery.definitionId))
    .leftJoin(tubeCountSubquery, eq(controlDefinition.id, tubeCountSubquery.definitionId))
    .where(eq(controlDefinition.controlType, 'blood'))
  
  const results = await query

  // Parse properties to extract strains and density
  const controls = results.map(row => {
    const parsed = parseControlProperties(row.properties, strainMap)
    return {
      ...row,
      strains: parsed.strains,
      targetDensity: parsed.targetDensity,
      targetDensityUnitId: parsed.targetDensityUnitId,
      unitSymbol: parsed.unitSymbol,
    }
  })
  
  return c.json({ controls })
})

// Get control definition by ID (filtered to blood controls)
controls.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid blood control ID' }, 400)
  }

  const control = await dbInstance
    .select()
    .from(controlDefinition)
    .where(and(
      eq(controlDefinition.id, id),
      eq(controlDefinition.controlType, 'blood')
    ))
    .get()

  if (!control) {
    return c.json({ error: 'Blood control not found' }, 404)
  }

  return c.json({ control })
})

// Get control definition summary with composition and batches
controls.get('/:id/summary', authMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  if (isNaN(id)) return c.json({ error: 'Invalid control ID' }, 400)

  try {
    const result = await getBloodControlDefinitionSummary(dbInstance, id)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Check for duplicate control definition (only checks blood controls)
controls.post('/check-unique', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional().default('blood'),
      targetDensity: z.number().optional(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(strainCompositionEntrySchema).optional(),
    })

    const data = schema.parse(body)
    const existing = await findBloodControlDefinitionByComposition(dbInstance, {
      strains: data.strains ?? [],
      targetDensity: data.targetDensity,
      targetDensityUnitId: data.targetDensityUnitId,
    }, { densityMode: 'optional' })

    if (existing) {
      return c.json({ exists: true, controlDefinition: existing })
    }
    return c.json({ exists: false })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Suggest name for control definition (preview without creating)
controls.post('/suggest-name', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).optional(),
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional().default('blood'),
      targetDensity: z.number(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(strainCompositionEntrySchema),
      properties: z.record(z.string(), z.any()).optional(),
    })

    const data = schema.parse(body)
    const controlType = 'blood'

    const resolved = await resolveStrainComposition(dbInstance, data.strains)
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, 400)
    }
    const { strainsWithNames } = resolved

    const allDefinitions = await dbInstance
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.controlType, controlType))

    const existingMatch = findMatchingDefinitionInList(allDefinitions, {
      strains: data.strains,
      targetDensity: data.targetDensity,
      targetDensityUnitId: data.targetDensityUnitId,
    })

    const suggestedName = await generateUniqueControlDefinitionName(dbInstance, {
      controlType,
      targetDensity: data.targetDensity,
      targetDensityUnitId: data.targetDensityUnitId,
      strains: strainsWithNames,
    })

    return c.json({
      suggestedName,
      exists: existingMatch !== null,
      existingDefinition: existingMatch?.definition,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error suggesting name:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Find control definition by composition + density (lookup only; 404 when no match)
controls.post('/definitions/find', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      strains: z.array(strainCompositionEntrySchema),
      targetDensity: z.number(),
      targetDensityUnitId: z.number().int().optional(),
    })
    const data = schema.parse(body)
    const { strains, targetDensity, targetDensityUnitId } = data

    const resolved = await resolveStrainComposition(dbInstance, strains)
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, 400)
    }
    const { strainNameMap } = resolved

    const allDefinitions = await dbInstance
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.controlType, 'blood'))

    const match = findMatchingDefinitionInList(allDefinitions, {
      strains,
      targetDensity,
      targetDensityUnitId,
    })

    if (match) {
      const parsed = parseControlProperties(match.properties, strainNameMap)
      return c.json({
        control: {
          ...match.definition,
          strains: parsed.strains,
          targetDensity: parsed.targetDensity,
          targetDensityUnitId: parsed.targetDensityUnitId,
          unitSymbol: parsed.unitSymbol,
        },
      })
    }

    return c.json(
      { error: 'No control definition found for this composition and density. Create it first from Blood Controls.' },
      404,
    )
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
    console.error('Error finding control definition:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Bulk create or get control definitions (same composition, multiple densities)
controls.post('/definitions/bulk', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      strains: z.array(strainCompositionEntrySchema),
      targetDensities: z.array(z.number()).min(1),
      targetDensityUnitId: z.number().int().optional(),
      names: z.array(z.string()),
    }).refine((d) => d.names.length === d.targetDensities.length, {
      message: 'names length must match targetDensities length',
    })
    const data = schema.parse(body)
    const controlType = 'blood'
    const { strains, targetDensities, targetDensityUnitId } = data

    const resolved = await resolveStrainComposition(dbInstance, strains)
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, 400)
    }
    const { strainsWithNames, strainNameMap } = resolved

    const allDefinitions = await dbInstance
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.controlType, controlType))

    const user = c.get('user')
    const results: Array<ReturnType<typeof parseControlProperties> & { id: number; name: string; controlType: string; properties: unknown; created: string | null; lastUpdated: string | null; createdBy: number | null; updatedBy: number | null }> = []
    const providedNames = data.names

    for (let i = 0; i < targetDensities.length; i++) {
      const targetDensity = targetDensities[i]
      const existing = findMatchingDefinitionInList(allDefinitions, {
        strains,
        targetDensity,
        targetDensityUnitId,
      })
      if (existing) {
        const parsed = parseControlProperties(existing.properties, strainNameMap)
        results.push({
          ...existing.definition,
          strains: parsed.strains,
          targetDensity: parsed.targetDensity,
          targetDensityUnitId: parsed.targetDensityUnitId,
          unitSymbol: parsed.unitSymbol,
        })
        continue
      }

      let unitSymbol: string | undefined
      if (targetDensityUnitId !== undefined) {
        const unitRecord = await dbInstance.select().from(unit).where(eq(unit.id, targetDensityUnitId)).get()
        if (!unitRecord) return c.json({ error: `Invalid unit ID: ${targetDensityUnitId}` }, 400)
        unitSymbol = unitRecord.symbol
      }

      const props = buildBloodControlPropertiesPayload(
        strainsWithNames,
        targetDensity,
        targetDensityUnitId,
        unitSymbol,
      )

      let finalName: string
      const customName = providedNames[i]?.trim()
      if (customName) {
        const existingByName = await dbInstance
          .select({ id: controlDefinition.id })
          .from(controlDefinition)
          .where(eq(controlDefinition.name, customName))
          .get()
        if (existingByName) {
          return c.json({ error: `Control definition name "${customName}" is already in use` }, 400)
        }
        finalName = customName
      } else {
        finalName = await generateUniqueControlDefinitionName(dbInstance, {
          controlType,
          targetDensity,
          targetDensityUnitId,
          strains: strainsWithNames,
        })
      }
      const [newControl] = await dbInstance
        .insert(controlDefinition)
        .values({
          name: finalName,
          controlType,
          properties: props,
          createdBy: user?.id,
          updatedBy: user?.id,
        })
        .returning()
      const parsed = parseControlProperties(newControl.properties, strainNameMap)
      results.push({
        ...newControl,
        strains: parsed.strains,
        targetDensity: parsed.targetDensity,
        targetDensityUnitId: parsed.targetDensityUnitId,
        unitSymbol: parsed.unitSymbol,
      })
    }

    return c.json({ controls: results }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
    console.error('Error bulk creating control definitions:', error)
    return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500)
  }
})

// Create control definition (defaults to blood)
controls.post('/', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).optional(),
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional().default('blood'),
      targetDensity: z.number(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(strainCompositionEntrySchema),
      properties: z.record(z.string(), z.any()).optional(),
    })

    const data = schema.parse(body)
    const controlType = 'blood'
    const { strains, targetDensity, targetDensityUnitId, properties, name } = data

    const resolved = await resolveStrainComposition(dbInstance, strains)
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, 400)
    }
    const { strainsWithNames } = resolved

    const duplicate = await findBloodControlDefinitionByComposition(dbInstance, {
      strains,
      targetDensity,
      targetDensityUnitId,
    })
    if (duplicate) {
      return c.json({
        error: 'A control definition with this combination of density and strains already exists',
        existingDefinition: duplicate,
      }, 409)
    }

    const props: Record<string, unknown> = { ...(properties || {}) }
    let unitSymbol: string | undefined
    if (targetDensityUnitId !== undefined) {
      const unitRecord = await dbInstance.select().from(unit).where(eq(unit.id, targetDensityUnitId)).get()
      if (!unitRecord) {
        return c.json({ error: `Invalid unit ID: ${targetDensityUnitId}` }, 400)
      }
      unitSymbol = unitRecord.symbol
    }
    Object.assign(
      props,
      buildBloodControlPropertiesPayload(strainsWithNames, targetDensity, targetDensityUnitId, unitSymbol),
    )

    let finalName = name
    if (!finalName || finalName.trim() === '') {
      finalName = await generateUniqueControlDefinitionName(dbInstance, {
        controlType,
        targetDensity,
        targetDensityUnitId,
        strains: strainsWithNames,
      })
    } else {
      const existingByName = await dbInstance
        .select()
        .from(controlDefinition)
        .where(eq(controlDefinition.name, finalName))
        .get()
      if (existingByName) {
        return c.json({ error: 'A control definition with this name already exists' }, 409)
      }
    }

    const user = c.get('user')
    const result = await dbInstance
      .insert(controlDefinition)
      .values({
        name: finalName,
        controlType,
        properties: Object.keys(props).length > 0 ? props : null,
        createdBy: user?.id,
        updatedBy: user?.id,
      })
      .returning()

    const newControl = result[0]
    if (!newControl) {
      throw new Error('Insert did not return control definition row')
    }
    return c.json({ control: newControl }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error creating control definition:', error)
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'A control definition with this name already exists' }, 409)
    }
    return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500)
  }
})

// Update control definition (only blood controls)
controls.patch('/:id', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid blood control ID' }, 400)

    // Get existing control to merge properties (filtered to blood controls)
    const existing = await dbInstance
      .select()
      .from(controlDefinition)
      .where(and(
        eq(controlDefinition.id, id),
        eq(controlDefinition.controlType, 'blood')
      ))
      .get()
    
    if (!existing) {
      return c.json({ error: 'Blood control definition not found' }, 404)
    }

    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).optional(),
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional(),
      targetDensity: z.number().optional(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(strainCompositionEntrySchema).optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })

    const data = schema.parse(body)
    const { strains, targetDensity, targetDensityUnitId, properties, ...baseData } = data

    const existingProps = (existing.properties as Record<string, unknown>) || {}
    const newProps: Record<string, unknown> = { ...existingProps, ...(properties || {}) }

    if (strains !== undefined) {
      if (strains.length > 0) {
        const resolved = await resolveStrainComposition(dbInstance, strains)
        if (!resolved.ok) {
          return c.json({ error: resolved.error }, 400)
        }
        newProps.strains = resolved.strainsWithNames
      } else {
        delete newProps.strains
      }
    }
    if (targetDensity !== undefined) {
      newProps.targetDensity = targetDensity
    }
    if (targetDensityUnitId !== undefined) {
      newProps.targetDensityUnitId = targetDensityUnitId
      const unitRecord = await dbInstance.select().from(unit).where(eq(unit.id, targetDensityUnitId)).get()
      if (unitRecord) {
        newProps.targetDensityUnitSymbol = unitRecord.symbol
      }
    }

    // Update control definition
    const user = c.get('user')
    const [updatedControl] = await dbInstance
      .update(controlDefinition)
      .set({
        ...baseData,
        properties: Object.keys(newProps).length > 0 ? newProps : null,
        lastUpdated: sql`current_timestamp`,
        updatedBy: user?.id,
      })
      .where(eq(controlDefinition.id, id))
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: update must return row
    if (!updatedControl) {
      return c.json({ error: 'Blood control definition not found' }, 404)
    }
    return c.json({ control: updatedControl })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// List batches for a definition (filtered to blood controls)
controls.get('/:id/batches', authMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  if (isNaN(id)) return c.json({ error: 'Invalid blood control ID' }, 400)

  // Verify definition is a blood control
  const definition = await dbInstance
    .select()
    .from(controlDefinition)
    .where(and(
      eq(controlDefinition.id, id),
      eq(controlDefinition.controlType, 'blood')
    ))
    .get()

  if (!definition) {
    return c.json({ error: 'Blood control definition not found' }, 404)
  }

  const batches = await dbInstance
    .select()
    .from(controlBatch)
    .where(eq(controlBatch.controlDefinitionId, id))
    .orderBy(desc(controlBatch.productionDate))

  return c.json({ batches })
})

// Validate batch name
controls.post('/batches/validate-name', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
      excludeId: z.number().optional(),
    })
    
    const data = schema.parse(body)
    const validation = await validateControlBatchName(database, data.name, data.excludeId)
    
    return c.json(validation)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ valid: false, error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error validating batch name:', error)
    return c.json({ valid: false, error: 'Failed to validate batch name', details: error?.message }, 500)
  }
})

// Generate suggested batch name
controls.post('/batches/suggest-name', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      definitionId: z.number(),
      productionDate: z.string().optional(),
    })
    
    const data = schema.parse(body)
    
    // Get definition
    const definition = await dbInstance
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.id, data.definitionId))
      .get()
    
    if (!definition) {
      return c.json({ error: 'Control definition not found' }, 404)
    }
    
    const suggestedName = await generateUniqueBatchName(dbInstance, definition.name, data.productionDate)
    
    return c.json({ name: suggestedName })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error generating suggested batch name:', error)
    return c.json({ error: 'Failed to generate suggested name', details: error?.message }, 500)
  }
})

// Create a new batch (only for blood controls)
controls.post('/:id/batches', memberMiddleware, async (c) => {
  const definitionId = parseInt(requireParam(c, 'id'))
  if (isNaN(definitionId)) return c.json({ error: 'Invalid blood control ID' }, 400)

  try {
    const body = await c.req.json()
    const data = createBloodControlBatchSchema.parse(body)
    const user = c.get('user')
    const batch = await createBloodControlBatch(dbInstance, definitionId, data, user?.id)
    return c.json({ batch }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create batch with specimens
controls.post('/batches/create-with-specimens', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const data = createBatchWithSpecimensSchema.parse(body)
    const result = await createBatchWithSpecimens(dbInstance, data)
    return c.json(result, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Add specimens to existing batch
controls.post('/batches/:id/specimens/bulk', memberMiddleware, async (c) => {
  try {
    const batchId = parseInt(requireParam(c, 'id'))
    if (isNaN(batchId)) return c.json({ error: 'Invalid batch ID' }, 400)

    const body = await c.req.json()
    const data = addSpecimensToBatchSchema.parse(body)
    const result = await addSpecimensToBatch(dbInstance, batchId, data)
    return c.json(result, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Delete a single specimen from a batch
controls.delete('/batches/:batchId/specimens/:specimenId', memberMiddleware, async (c) => {
  const batchId = parseInt(requireParam(c, 'batchId'))
  const specimenId = parseInt(requireParam(c, 'specimenId'))
  if (isNaN(batchId) || isNaN(specimenId)) return c.json({ error: 'Invalid ID' }, 400)

  try {
    await deleteSpecimenFromBatch(dbInstance, batchId, specimenId)
    return c.json({ message: 'Specimen deleted successfully' })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Validate CSV
controls.post('/batches/validate-csv', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const { csvText } = validateControlBatchCsvSchema.parse(body)
    const result = await validateControlBatchCsv(dbInstance, csvText)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return controls
}
