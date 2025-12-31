import { Hono } from 'hono'
import { db } from '../db/client'
import {
  controlDefinition,
  controlBatch,
  unit,
  composition,
  compositionStrain,
  strain,
  specimen,
  specimenType,
  storageContainer,
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
  box,
  tube,
  sheet,
  paper,
  staticWell,
  location,
  bag,
} from '../db/schema'
import { eq, and, like, desc, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

const controls = new Hono()

// --- Control Batches ---

// List all control batches
controls.get('/batches', async (c) => {
  const spotCountSubquery = db
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`SUM(${storageContainer.remainingQuantity})`.as('spot_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(paper, eq(storageContainer.id, paper.id))
    .groupBy(specimen.controlBatchId)
    .as('spot_counts')

  const tubeCountSubquery = db
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('tube_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .where(
      sql`EXISTS (SELECT 1 FROM tube WHERE tube.id = ${storageContainer.id}) OR 
          EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
          EXISTS (SELECT 1 FROM cryovial_tube WHERE cryovial_tube.id = ${storageContainer.id}) OR
          EXISTS (SELECT 1 FROM static_well WHERE static_well.id = ${storageContainer.id})`
    )
    .groupBy(specimen.controlBatchId)
    .as('tube_counts')

  const specimenCountSubquery = db
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('specimen_count'),
    })
    .from(specimen)
    .groupBy(specimen.controlBatchId)
    .as('specimen_counts')

  const batchStrainsSubquery = db
    .select({
      definitionId: controlDefinition.id,
      strainsJson: sql<string>`json_group_array(json_object('id', ${strain.id}, 'name', ${strain.name}))`.as('strains_json'),
    })
    .from(controlDefinition)
    .innerJoin(compositionStrain, eq(controlDefinition.compositionId, compositionStrain.compositionId))
    .innerJoin(strain, eq(compositionStrain.strainId, strain.id))
    .groupBy(controlDefinition.id)
    .as('batch_strains')

  const batchesResults = await db
    .select({
      id: controlBatch.id,
      controlDefinitionId: controlBatch.controlDefinitionId,
      name: controlBatch.name,
      productionDate: controlBatch.productionDate,
      created: controlBatch.created,
      lastUpdated: controlBatch.lastUpdated,
      definitionName: controlDefinition.name,
      controlType: controlDefinition.controlType,
      targetDensity: controlDefinition.targetDensity,
      unitSymbol: unit.symbol,
      specimenCount: sql<number>`COALESCE(${specimenCountSubquery.count}, 0)`,
      spotCount: sql<number>`COALESCE(${spotCountSubquery.count}, 0)`,
      tubeCount: sql<number>`COALESCE(${tubeCountSubquery.count}, 0)`,
      inventoryTotal: sql<number>`COALESCE(${spotCountSubquery.count}, 0) + COALESCE(${tubeCountSubquery.count}, 0)`,
      strainsJson: batchStrainsSubquery.strainsJson,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .leftJoin(unit, eq(controlDefinition.targetDensityUnitId, unit.id))
    .leftJoin(specimenCountSubquery, eq(controlBatch.id, specimenCountSubquery.batchId))
    .leftJoin(spotCountSubquery, eq(controlBatch.id, spotCountSubquery.batchId))
    .leftJoin(tubeCountSubquery, eq(controlBatch.id, tubeCountSubquery.batchId))
    .leftJoin(batchStrainsSubquery, eq(controlBatch.controlDefinitionId, batchStrainsSubquery.definitionId))
    .orderBy(desc(controlBatch.created))

  const batches = batchesResults.map(row => ({
    ...row,
    strains: row.strainsJson ? JSON.parse(row.strainsJson).filter((s: any) => s.id !== null) : []
  }))

  return c.json({ batches })
})

// Get batch detail
controls.get('/batches/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

  const batch = await db
    .select()
    .from(controlBatch)
    .where(eq(controlBatch.id, id))
    .get()

  if (!batch) return c.json({ error: 'Batch not found' }, 404)

  return c.json({ batch })
})

// Get batch summary with enriched specimen data
controls.get('/batches/:id/summary', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

    // Get batch
    const batchDataRaw = await db
      .select()
      .from(controlBatch)
      .where(eq(controlBatch.id, id))
      .get()

    if (!batchDataRaw) {
      return c.json({ error: 'Batch not found' }, 404)
    }

    // Get definition if exists
    let definitionData = null
    if (batchDataRaw.controlDefinitionId) {
      definitionData = await db
        .select()
        .from(controlDefinition)
        .where(eq(controlDefinition.id, batchDataRaw.controlDefinitionId))
        .get()
    }

    // Get unit if exists
    let unitSymbol = undefined
    if (definitionData?.targetDensityUnitId) {
      const unitData = await db
        .select({ symbol: unit.symbol })
        .from(unit)
        .where(eq(unit.id, definitionData.targetDensityUnitId))
        .get()
      unitSymbol = unitData?.symbol
    }

    const batchData = {
      ...batchDataRaw,
      definition: definitionData ? {
        id: definitionData.id,
        name: definitionData.name,
        controlType: definitionData.controlType,
        targetDensity: definitionData.targetDensity || undefined,
        targetDensityUnitId: definitionData.targetDensityUnitId || undefined,
        compositionId: definitionData.compositionId || undefined,
        unitSymbol: unitSymbol,
      } : undefined
    }

    // Get composition details if available
    let compositionDetails = null
    if (batchData.definition?.compositionId) {
      const comp = await db
        .select({
          id: composition.id,
          label: composition.label,
        })
        .from(composition)
        .where(eq(composition.id, batchData.definition.compositionId))
        .get()

      if (comp) {
        const strainsList = await db
          .select({
            id: strain.id,
            name: strain.name,
            percentage: compositionStrain.percentage,
          })
          .from(compositionStrain)
          .leftJoin(strain, eq(compositionStrain.strainId, strain.id))
          .where(eq(compositionStrain.compositionId, batchData.definition.compositionId))
        
        compositionDetails = {
          ...comp,
          strains: strainsList,
        }
      }
    }

    const batch = {
      ...batchData,
      composition: compositionDetails
    }

    // Get all specimens for this batch
    const specimensList = await db
      .select({
        id: specimen.id,
        studySubjectId: specimen.studySubjectId,
        controlBatchId: specimen.controlBatchId,
        specimenTypeId: specimen.specimenTypeId,
        collectionDate: specimen.collectionDate,
        created: specimen.created,
        lastUpdated: specimen.lastUpdated,
      })
      .from(specimen)
      .where(eq(specimen.controlBatchId, id))

    if (specimensList.length === 0) {
      return c.json({
        batch,
        specimens: [],
        summary: {
          totalSpecimens: 0,
          totalContainers: 0,
          specimenTypes: [],
          containerTypes: {},
          collectionDateRange: null,
          timeline: [],
        },
      })
    }

    const specimenIds = specimensList.map(s => s.id)
    const specimenTypeIds = [...new Set(specimensList.map(s => s.specimenTypeId))]

    // Get specimen types
    const specimenTypes = await db
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))

    const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))

    // Get all containers for these specimens with units
    const containers = await db
      .select({
        id: storageContainer.id,
        specimenId: storageContainer.specimenId,
        totalQuantity: storageContainer.totalQuantity,
        remainingQuantity: storageContainer.remainingQuantity,
        unitId: storageContainer.unitId,
        unitSymbol: unit.symbol,
      })
      .from(storageContainer)
      .leftJoin(unit, eq(storageContainer.unitId, unit.id))
      .where(inArray(storageContainer.specimenId, specimenIds))

    const containerIds = containers.map(c => c.id)

    // Get container type information with manifest names and locations
    const [micronixTubesList, cryovialBoxesList, boxesList, sheetsList, bagsList, staticWellsList] = await Promise.all([
      (containerIds.length > 0
        ? db
            .select({ 
              id: micronixTube.id, 
              collectionId: micronixTube.collectionId,
              barcode: micronixTube.barcode,
              position: micronixTube.position,
              collectionName: micronixPlate.name,
              locationRoot: location.locationRoot,
              levelI: location.levelI,
              levelII: location.levelII,
              levelIII: location.levelIII,
            })
            .from(micronixTube)
            .leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
            .leftJoin(location, eq(micronixPlate.locationId, location.id))
            .where(inArray(micronixTube.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? db
            .select({ 
              id: cryovialTube.id, 
              collectionId: cryovialTube.collectionId,
              barcode: cryovialTube.barcode,
              position: cryovialTube.position,
              collectionName: cryovialBox.name,
              locationRoot: location.locationRoot,
              levelI: location.levelI,
              levelII: location.levelII,
              levelIII: location.levelIII,
            })
            .from(cryovialTube)
            .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
            .leftJoin(location, eq(cryovialBox.locationId, location.id))
            .where(inArray(cryovialTube.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? db
            .select({ 
              id: tube.id, 
              boxId: tube.boxId,
              boxPosition: tube.boxPosition,
              label: tube.label,
              collectionName: box.name,
              locationRoot: location.locationRoot,
              levelI: location.levelI,
              levelII: location.levelII,
              levelIII: location.levelIII,
            })
            .from(tube)
            .leftJoin(box, eq(tube.boxId, box.id))
            .leftJoin(location, eq(box.locationId, location.id))
            .where(inArray(tube.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? db
            .select({ 
              id: paper.id, 
              sheetId: paper.sheetId,
              barcode: paper.barcode,
              position: paper.position,
              collectionName: sheet.name,
              boxId: sheet.boxId,
              bagId: sheet.bagId,
            })
            .from(paper)
            .leftJoin(sheet, eq(paper.sheetId, sheet.id))
            .where(inArray(paper.id, containerIds))
        : []) as Promise<any[]>,
      Promise.resolve([]) as Promise<any[]>,
      (containerIds.length > 0
        ? db
            .select({ 
              id: staticWell.id, 
              collectionId: staticWell.collectionId,
              position: staticWell.position,
              collectionName: micronixPlate.name,
              locationRoot: location.locationRoot,
              levelI: location.levelI,
              levelII: location.levelII,
              levelIII: location.levelIII,
            })
            .from(staticWell)
            .leftJoin(micronixPlate, eq(staticWell.collectionId, micronixPlate.id))
            .leftJoin(location, eq(micronixPlate.locationId, location.id))
            .where(inArray(staticWell.id, containerIds))
        : []) as Promise<any[]>,
    ])

    // Create container info maps
    const containerInfoMap = new Map<number, { type: string; collectionName: string; position?: string; id: number; locationPath?: string }>()
    
    function formatLocPath(loc: any, parentName?: string) {
      if (!loc || !loc.locationRoot) return parentName
      const parts = [loc.locationRoot, loc.levelI, loc.levelII]
      if (loc.levelIII) parts.push(loc.levelIII)
      let path = parts.filter(Boolean).join(' → ')
      if (parentName) {
        path += ` → ${parentName}`
      }
      return path
    }
    
    micronixTubesList.forEach(t => containerInfoMap.set(t.id, { type: 'micronix_tube', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.collectionId, locationPath: formatLocPath(t) }))
    cryovialBoxesList.forEach(t => containerInfoMap.set(t.id, { type: 'cryovial_tube', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.collectionId, locationPath: formatLocPath(t) }))
    boxesList.forEach(t => containerInfoMap.set(t.id, { type: 'tube', collectionName: t.collectionName || 'Unknown', position: t.boxPosition || undefined, id: t.boxId, locationPath: formatLocPath(t) }))
    
    // For papers, we need to fetch the parent location separately if it's nested
    for (const t of sheetsList) {
      let locPath: string | undefined
      if (t.boxId) {
        const res = await db.select({ box: box, location: location }).from(box).leftJoin(location, eq(box.locationId, location.id)).where(eq(box.id, t.boxId)).get()
        locPath = formatLocPath(res?.location, res?.box.name)
      } else if (t.bagId) {
        const res = await db.select({ bag: bag, location: location }).from(bag).leftJoin(location, eq(bag.locationId, location.id)).where(eq(bag.id, t.bagId)).get()
        locPath = formatLocPath(res?.location, res?.bag.name)
      }
      containerInfoMap.set(t.id, { type: 'paper', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.sheetId, locationPath: locPath })
    }

    staticWellsList.forEach(t => containerInfoMap.set(t.id, { type: 'static_well', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.collectionId, locationPath: formatLocPath(t) }))

    // Count containers and sum remaining quantity per specimen
    const containersBySpecimen = new Map<number, Array<{ id: number; remainingQuantity: number; unit: string; type: string; collectionName: string; position?: string; collectionId?: number; locationPath?: string }>>()
    
    containers.forEach(container => {
      if (!containersBySpecimen.has(container.specimenId)) {
        containersBySpecimen.set(container.specimenId, [])
      }
      
      const info = containerInfoMap.get(container.id) || { type: 'unknown', collectionName: 'Unknown', position: undefined, id: 0, locationPath: undefined }
      containersBySpecimen.get(container.specimenId)!.push({
        id: container.id,
        remainingQuantity: container.remainingQuantity || 0,
        unit: (container.unitSymbol as string | null) ?? 'units',
        type: info.type,
        collectionName: info.collectionName,
        position: info.position,
        collectionId: info.id,
        locationPath: info.locationPath
      })
    })

    // Build enriched specimen list
    const enrichedSpecimens = specimensList.map(spec => {
      const specimenContainers = containersBySpecimen.get(spec.id) || []
      const containerCount = specimenContainers.length
      
      const containerBreakdown: Record<string, number> = {}
      const unitBreakdown: Record<string, number> = {}
      
      specimenContainers.forEach(c => {
        containerBreakdown[c.type] = (containerBreakdown[c.type] || 0) + 1
        unitBreakdown[c.unit] = (unitBreakdown[c.unit] || 0) + c.remainingQuantity
      })
      
      return {
        id: spec.id,
        specimenTypeId: spec.specimenTypeId,
        specimenTypeName: specimenTypeMap.get(spec.specimenTypeId) || 'Unknown',
        collectionDate: spec.collectionDate,
        created: spec.created,
        lastUpdated: spec.lastUpdated,
        containerCount,
        containerBreakdown,
        unitBreakdown,
        containers: specimenContainers.map(c => ({
          id: c.id,
          type: c.type,
          remainingQuantity: c.remainingQuantity,
          unit: c.unit,
          collectionName: c.collectionName,
          position: (c as any).position,
          collectionId: c.collectionId,
          locationPath: c.locationPath
        }))
      }
    })

    // Calculate inventory breakdown for summary
    const inventoryMap = new Map<string, {
      totalQuantity: number
      remainingQuantity: number
      containerCount: number
      manifests: Set<string>
      locationPaths: Set<string>
    }>()

    containers.forEach(container => {
      const info = containerInfoMap.get(container.id) || { type: 'unknown', collectionName: 'Unknown', position: undefined, id: 0, locationPath: undefined }
      const unitSymbol = container.unitSymbol || 'units'
      const key = `${info.type}|${unitSymbol}`

      const current = inventoryMap.get(key) || { totalQuantity: 0, remainingQuantity: 0, containerCount: 0, collections: new Set<string>(), locationPaths: new Set<string>() }
      if (info.collectionName && info.collectionName !== 'Unknown') {
        current.collections.add(info.collectionName)
      }
      if (info.locationPath) {
        current.locationPaths.add(info.locationPath)
      }
      inventoryMap.set(key, {
        totalQuantity: current.totalQuantity + (container.totalQuantity || 0),
        remainingQuantity: current.remainingQuantity + (container.remainingQuantity || 0),
        containerCount: current.containerCount + 1,
        collections: current.collections,
        locationPaths: current.locationPaths
      })
    })

    const inventory = Array.from(inventoryMap.entries()).map(([key, stats]) => {
      const [type, unitSymbol] = key.split('|')
      return {
        type,
        unit: unitSymbol,
        totalQuantity: stats.totalQuantity,
        remainingQuantity: stats.remainingQuantity,
        containerCount: stats.containerCount,
        collections: Array.from(stats.collections),
        locationPaths: Array.from(stats.locationPaths)
      }
    })

    // Calculate summary statistics
    const totalContainers = containers.length
    const totalRemainingQuantity = containers.reduce((sum, c) => sum + (c.remainingQuantity || 0), 0)
    
    // Specimen type breakdown
    const specimenTypeCounts: Record<string, number> = {}
    enrichedSpecimens.forEach(spec => {
      const typeName = spec.specimenTypeName
      specimenTypeCounts[typeName] = (specimenTypeCounts[typeName] || 0) + 1
    })

    // Collection date range
    const collectionDates = enrichedSpecimens
      .map(s => s.collectionDate)
      .filter(Boolean)
      .sort()
    const collectionDateRange = collectionDates.length > 0
      ? {
          earliest: collectionDates[0],
          latest: collectionDates[collectionDates.length - 1],
        }
      : null

    // Timeline data (sorted by collection date)
    const timeline = enrichedSpecimens
      .map(spec => ({
        id: spec.id,
        date: spec.collectionDate || spec.created,
        specimenTypeName: spec.specimenTypeName,
        specimenTypeId: spec.specimenTypeId,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return c.json({
      batch,
      specimens: enrichedSpecimens,
      summary: {
        totalSpecimens: specimensList.length,
        totalContainers,
        totalRemainingQuantity,
        inventory, // New structured inventory
        specimenTypes: Object.entries(specimenTypeCounts).map(([name, count]) => ({
          name,
          count,
        })),
        collectionDateRange,
        timeline,
      },
    })
  } catch (error: any) {
    console.error('Error fetching batch summary:', error)
    return c.json({ error: 'Failed to fetch batch summary', details: error.message }, 500)
  }
})

// --- Control Definitions ---

// List all control definitions
controls.get('/', async (c) => {
  const type = c.req.query('type')
  
  const batchCountSubquery = db
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('batch_count'),
    })
    .from(controlBatch)
    .groupBy(controlBatch.controlDefinitionId)
    .as('batch_counts')

  const specimenCountSubquery = db
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('specimen_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .groupBy(controlBatch.controlDefinitionId)
    .as('specimen_counts')

  const spotCountSubquery = db
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

  const tubeCountSubquery = db
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('tube_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .where(
      sql`EXISTS (SELECT 1 FROM tube WHERE tube.id = ${storageContainer.id}) OR 
          EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
          EXISTS (SELECT 1 FROM cryovial_tube WHERE cryovial_tube.id = ${storageContainer.id}) OR
          EXISTS (SELECT 1 FROM static_well WHERE static_well.id = ${storageContainer.id})`
    )
    .groupBy(controlBatch.controlDefinitionId)
    .as('tube_counts')

  const definitionStrainsSubquery = db
    .select({
      definitionId: controlDefinition.id,
      strainsJson: sql<string>`json_group_array(json_object('id', ${strain.id}, 'name', ${strain.name}))`.as('strains_json'),
    })
    .from(controlDefinition)
    .innerJoin(compositionStrain, eq(controlDefinition.compositionId, compositionStrain.compositionId))
    .innerJoin(strain, eq(compositionStrain.strainId, strain.id))
    .groupBy(controlDefinition.id)
    .as('definition_strains')

  let query = db
    .select({
      id: controlDefinition.id,
      name: controlDefinition.name,
      controlType: controlDefinition.controlType,
      compositionId: controlDefinition.compositionId,
      targetDensity: controlDefinition.targetDensity,
      targetDensityUnitId: controlDefinition.targetDensityUnitId,
      properties: controlDefinition.properties,
      created: controlDefinition.created,
      lastUpdated: controlDefinition.lastUpdated,
      unitSymbol: unit.symbol,
      batchCount: sql<number>`COALESCE(${batchCountSubquery.count}, 0)`,
      specimenCount: sql<number>`COALESCE(${specimenCountSubquery.count}, 0)`,
      spotCount: sql<number>`COALESCE(${spotCountSubquery.count}, 0)`,
      tubeCount: sql<number>`COALESCE(${tubeCountSubquery.count}, 0)`,
      inventoryTotal: sql<number>`COALESCE(${spotCountSubquery.count}, 0) + COALESCE(${tubeCountSubquery.count}, 0)`,
      strainsJson: definitionStrainsSubquery.strainsJson,
    })
    .from(controlDefinition)
    .leftJoin(unit, eq(controlDefinition.targetDensityUnitId, unit.id))
    .leftJoin(batchCountSubquery, eq(controlDefinition.id, batchCountSubquery.definitionId))
    .leftJoin(specimenCountSubquery, eq(controlDefinition.id, specimenCountSubquery.definitionId))
    .leftJoin(spotCountSubquery, eq(controlDefinition.id, spotCountSubquery.definitionId))
    .leftJoin(tubeCountSubquery, eq(controlDefinition.id, tubeCountSubquery.definitionId))
    .leftJoin(definitionStrainsSubquery, eq(controlDefinition.id, definitionStrainsSubquery.definitionId))
  
  if (type) {
    query = query.where(eq(controlDefinition.controlType, type)) as any
  }
  
  const results = await query

  const controls = results.map(row => ({
    ...row,
    strains: row.strainsJson ? JSON.parse(row.strainsJson).filter((s: any) => s.id !== null) : []
  }))
  
  return c.json({ controls })
})

// Get control definition by ID
controls.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid control ID' }, 400)
  }

  const control = await db
    .select()
    .from(controlDefinition)
    .where(eq(controlDefinition.id, id))
    .get()

  if (!control) {
    return c.json({ error: 'Control not found' }, 404)
  }

  return c.json({ control })
})

// Get control definition summary with composition and batches
controls.get('/:id/summary', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid control ID' }, 400)

  try {
    // 1. Get control definition and unit
    const control = await db
      .select({
        id: controlDefinition.id,
        name: controlDefinition.name,
        controlType: controlDefinition.controlType,
        targetDensity: controlDefinition.targetDensity,
        unitSymbol: unit.symbol,
        compositionId: controlDefinition.compositionId,
        properties: controlDefinition.properties,
        created: controlDefinition.created,
      })
      .from(controlDefinition)
      .leftJoin(unit, eq(controlDefinition.targetDensityUnitId, unit.id))
      .where(eq(controlDefinition.id, id))
      .get()

    if (!control) return c.json({ error: 'Control not found' }, 404)

    // 2. Get composition details if available
    let compositionDetails = null
    if (control.compositionId) {
      const comp = await db
        .select({
          id: composition.id,
          label: composition.label,
        })
        .from(composition)
        .where(eq(composition.id, control.compositionId))
        .get()

      if (comp) {
        const strainsList = await db
          .select({
            id: strain.id,
            name: strain.name,
            percentage: compositionStrain.percentage,
          })
          .from(compositionStrain)
          .leftJoin(strain, eq(compositionStrain.strainId, strain.id))
          .where(eq(compositionStrain.compositionId, control.compositionId))
        
        compositionDetails = {
          ...comp,
          strains: strainsList,
        }
      }
    }

    // 3. Get all batches and calculate stock levels
    const spotCountSubquery = db
      .select({
        batchId: specimen.controlBatchId,
        count: sql<number>`SUM(${storageContainer.remainingQuantity})`.as('spot_count'),
      })
      .from(specimen)
      .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
      .innerJoin(paper, eq(storageContainer.id, paper.id))
      .groupBy(specimen.controlBatchId)
      .as('batch_spot_counts')

    const tubeCountSubquery = db
      .select({
        batchId: specimen.controlBatchId,
        count: sql<number>`count(*)`.as('tube_count'),
      })
      .from(specimen)
      .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
      .where(
        and(
          sql`EXISTS (SELECT 1 FROM tube WHERE tube.id = ${storageContainer.id}) OR 
              EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
              EXISTS (SELECT 1 FROM cryovial_tube WHERE cryovial_tube.id = ${storageContainer.id}) OR
              EXISTS (SELECT 1 FROM static_well WHERE static_well.id = ${storageContainer.id})`,
          sql`${storageContainer.remainingQuantity} > 0`
        )
      )
      .groupBy(specimen.controlBatchId)
      .as('batch_tube_counts')

    const batchesList = await db
      .select({
        id: controlBatch.id,
        name: controlBatch.name,
        productionDate: controlBatch.productionDate,
        created: controlBatch.created,
        spotCount: sql<number>`COALESCE(${spotCountSubquery.count}, 0)`,
        tubeCount: sql<number>`COALESCE(${tubeCountSubquery.count}, 0)`,
        inventoryTotal: sql<number>`COALESCE(${spotCountSubquery.count}, 0) + COALESCE(${tubeCountSubquery.count}, 0)`,
      })
      .from(controlBatch)
      .leftJoin(spotCountSubquery, eq(controlBatch.id, spotCountSubquery.batchId))
      .leftJoin(tubeCountSubquery, eq(controlBatch.id, tubeCountSubquery.batchId))
      .where(eq(controlBatch.controlDefinitionId, id))
      .orderBy(desc(controlBatch.productionDate))

    const enrichedBatches = await Promise.all(
      batchesList.map(async (batch) => {
        // Get specimen count (total records)
        const specimensCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(specimen)
          .where(eq(specimen.controlBatchId, batch.id))
          .get()

        // Get total remaining quantity and unit for summary badges
        const inventory = await db
          .select({
            totalRemaining: sql<number>`sum(${storageContainer.remainingQuantity})`,
            unitSymbol: unit.symbol,
          })
          .from(storageContainer)
          .leftJoin(specimen, eq(storageContainer.specimenId, specimen.id))
          .leftJoin(unit, eq(storageContainer.unitId, unit.id))
          .where(eq(specimen.controlBatchId, batch.id))
          .groupBy(unit.id)

        return {
          ...batch,
          specimenCount: specimensCount?.count || 0,
          inventory: inventory || [],
        }
      })
    )

    // 4. Calculate aggregate stats
    const totalSpots = enrichedBatches.reduce((sum, b) => sum + (b.spotCount || 0), 0)
    const totalTubes = enrichedBatches.reduce((sum, b) => sum + (b.tubeCount || 0), 0)
    const totalSpecimens = enrichedBatches.reduce((sum, b) => sum + (b.specimenCount || 0), 0)
    const inStockBatchesCount = enrichedBatches.filter(b => (b.inventoryTotal || 0) > 0).length
    
    const latestBatch = enrichedBatches.length > 0 
      ? enrichedBatches.reduce((latest, current) => {
          if (!latest.productionDate) return current
          if (!current.productionDate) return latest
          return new Date(current.productionDate) > new Date(latest.productionDate) ? current : latest
        })
      : null

    // Calculate unique locations
    const batchIds = enrichedBatches.map(b => b.id)
    let activeLocationsCount = 0
    if (batchIds.length > 0) {
      const locationResults = await db
        .select({ locationId: location.id })
        .from(location)
        .innerJoin(micronixPlate, eq(location.id, micronixPlate.locationId))
        .innerJoin(micronixTube, eq(micronixPlate.id, micronixTube.collectionId))
        .innerJoin(storageContainer, eq(micronixTube.id, storageContainer.id))
        .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
        .where(inArray(specimen.controlBatchId, batchIds))
        .union(
          db
            .select({ locationId: location.id })
            .from(location)
            .innerJoin(cryovialBox, eq(location.id, cryovialBox.locationId))
            .innerJoin(cryovialTube, eq(cryovialBox.id, cryovialTube.collectionId))
            .innerJoin(storageContainer, eq(cryovialTube.id, storageContainer.id))
            .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
            .where(inArray(specimen.controlBatchId, batchIds))
        )
        .union(
          db
            .select({ locationId: location.id })
            .from(location)
            .innerJoin(box, eq(location.id, box.locationId))
            .innerJoin(tube, eq(box.id, tube.boxId))
            .innerJoin(storageContainer, eq(tube.id, storageContainer.id))
            .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
            .where(inArray(specimen.controlBatchId, batchIds))
        )
        .union(
          db
            .select({ locationId: location.id })
            .from(location)
            .innerJoin(box, eq(location.id, box.locationId))
            .innerJoin(sheet, eq(box.id, sheet.boxId))
            .innerJoin(paper, eq(sheet.id, paper.sheetId))
            .innerJoin(storageContainer, eq(paper.id, storageContainer.id))
            .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
            .where(inArray(specimen.controlBatchId, batchIds))
        )
        .union(
          db
            .select({ locationId: location.id })
            .from(location)
            .innerJoin(bag, eq(location.id, bag.locationId))
            .innerJoin(sheet, eq(bag.id, sheet.bagId))
            .innerJoin(paper, eq(sheet.id, paper.sheetId))
            .innerJoin(storageContainer, eq(paper.id, storageContainer.id))
            .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
            .where(inArray(specimen.controlBatchId, batchIds))
        )
      
      activeLocationsCount = locationResults.length
    }
    
    return c.json({
      control,
      composition: compositionDetails,
      batches: enrichedBatches,
      stats: {
        totalBatches: enrichedBatches.length,
        totalContainers: totalSpots + totalTubes,
        totalSpots,
        totalTubes,
        totalSpecimens,
        inStockBatchesCount,
        latestBatchDate: latestBatch?.productionDate || null,
        activeLocationsCount,
      }
    })
  } catch (error: any) {
    console.error('Error fetching control summary:', error)
    return c.json({ error: 'Internal server error', details: error.message }, 500)
  }
})

// Create control definition
controls.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']),
      compositionId: z.number().int().optional(),
      targetDensity: z.number().optional(),
      targetDensityUnitId: z.number().int().optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })
    
    const data = schema.parse(body)
    
    const [newControl] = await db
      .insert(controlDefinition)
      .values(data)
      .returning()
    
    return c.json({ control: newControl }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// List batches for a definition
controls.get('/:id/batches', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid control ID' }, 400)

  const batches = await db
    .select()
    .from(controlBatch)
    .where(eq(controlBatch.controlDefinitionId, id))
    .orderBy(desc(controlBatch.productionDate))

  return c.json({ batches })
})

// Create a new batch
controls.post('/:id/batches', async (c) => {
  try {
    const definitionId = parseInt(c.req.param('id'))
    if (isNaN(definitionId)) return c.json({ error: 'Invalid control ID' }, 400)

    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
      productionDate: z.string().optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })
    
    const data = schema.parse(body)
    
    const [newBatch] = await db
      .insert(controlBatch)
      .values({
        controlDefinitionId: definitionId,
        ...data,
      })
      .returning()
    
    return c.json({ batch: newBatch }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default controls
