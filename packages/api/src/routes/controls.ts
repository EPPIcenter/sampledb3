import { Hono } from 'hono'
import { db } from '../db/client'
import {
  controlDefinition,
  controlBatch,
  strain,
  unit,
  specimen,
  specimenType,
  storageContainer,
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
  box,
  sheet,
  paper,
  staticWell,
  location,
  bag,
  storageContainerTag,
} from '../db/schema'
import { eq, and, like, desc, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

const controls = new Hono()

// Helper function to extract strain/density data from properties JSON
function parseControlProperties(properties: any, strainMap?: Map<number, { name: string }>) {
  if (!properties) return { strains: [], targetDensity: undefined, unitSymbol: undefined, targetDensityUnitId: undefined }
  
  let props: any
  try {
    props = typeof properties === 'string' ? JSON.parse(properties) : properties
  } catch (e) {
    // If parsing fails, return empty data
    return { strains: [], targetDensity: undefined, unitSymbol: undefined, targetDensityUnitId: undefined }
  }
  
  const strains = (props.strains || []).map((s: any) => {
    if (typeof s === 'number') {
      // Just strain ID - look up name if available
      return { id: s, name: strainMap?.get(s)?.name || `Strain ${s}` }
    }
    // Full strain object with id, name, percentage
    return s
  })
  
  // Extract target density - handle both number and string formats
  const targetDensity = props.targetDensity !== undefined && props.targetDensity !== null
    ? (typeof props.targetDensity === 'string' ? parseFloat(props.targetDensity) : props.targetDensity)
    : undefined
  
  // Extract unit symbol - check multiple possible locations
  const unitSymbol = props.targetDensityUnit?.symbol 
    || props.targetDensityUnitSymbol 
    || (props.targetDensityUnit && typeof props.targetDensityUnit === 'string' ? props.targetDensityUnit : undefined)
  
  // Extract unit ID
  const targetDensityUnitId = props.targetDensityUnitId !== undefined && props.targetDensityUnitId !== null
    ? (typeof props.targetDensityUnitId === 'string' ? parseInt(props.targetDensityUnitId) : props.targetDensityUnitId)
    : undefined
  
  return {
    strains,
    targetDensity,
    unitSymbol,
    targetDensityUnitId,
  }
}

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
      sql`EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
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

  // Strains are now stored in properties JSON, so we'll parse them in the response

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
      properties: controlDefinition.properties,
      specimenCount: sql<number>`COALESCE(${specimenCountSubquery.count}, 0)`,
      spotCount: sql<number>`COALESCE(${spotCountSubquery.count}, 0)`,
      tubeCount: sql<number>`COALESCE(${tubeCountSubquery.count}, 0)`,
      inventoryTotal: sql<number>`COALESCE(${spotCountSubquery.count}, 0) + COALESCE(${tubeCountSubquery.count}, 0)`,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .leftJoin(specimenCountSubquery, eq(controlBatch.id, specimenCountSubquery.batchId))
    .leftJoin(spotCountSubquery, eq(controlBatch.id, spotCountSubquery.batchId))
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
controls.get('/batches/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

  const result = await db
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

  if (!result) return c.json({ error: 'Blood control batch not found' }, 404)

  return c.json({ batch: result.batch })
})

// Delete batch and all associated data
controls.delete('/batches/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

  try {
    // Check if batch exists and is associated with a blood control definition
    const batchWithDefinition = await db
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

    if (!batchWithDefinition) {
      return c.json({ error: 'Blood control batch not found' }, 404)
    }

    const batch = batchWithDefinition.batch

    // Find all specimens for this batch
    const specimens = await db
      .select({ id: specimen.id })
      .from(specimen)
      .where(eq(specimen.controlBatchId, id))

    const specimenIds = specimens.map(s => s.id)

    // If there are specimens, find all containers
    let containerIds: number[] = []
    if (specimenIds.length > 0) {
      const containers = await db
        .select({ id: storageContainer.id })
        .from(storageContainer)
        .where(inArray(storageContainer.specimenId, specimenIds))
      
      containerIds = containers.map(c => c.id)
    }

    // Delete in transaction to ensure atomicity
    db.transaction((tx) => {
      // 1. Delete storageContainerTag records for all containers
      if (containerIds.length > 0) {
        tx.delete(storageContainerTag)
          .where(inArray(storageContainerTag.storageContainerId, containerIds))
          .run()
      }

      // 2. Delete container-specific records
      if (containerIds.length > 0) {
        // Delete paper records
        tx.delete(paper)
          .where(inArray(paper.id, containerIds))
          .run()

        // Delete micronixTube records
        tx.delete(micronixTube)
          .where(inArray(micronixTube.id, containerIds))
          .run()

        // Delete cryovialTube records
        tx.delete(cryovialTube)
          .where(inArray(cryovialTube.id, containerIds))
          .run()

        // Delete staticWell records
        tx.delete(staticWell)
          .where(inArray(staticWell.id, containerIds))
          .run()
      }

      // 3. Delete storageContainer records
      if (containerIds.length > 0) {
        tx.delete(storageContainer)
          .where(inArray(storageContainer.id, containerIds))
          .run()
      }

      // 4. Delete specimen records
      if (specimenIds.length > 0) {
        tx.delete(specimen)
          .where(inArray(specimen.id, specimenIds))
          .run()
      }

      // 5. Delete controlBatch record
      tx.delete(controlBatch)
        .where(eq(controlBatch.id, id))
        .run()
    })

    return c.json({ message: 'Batch deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting batch:', error)
    return c.json({ 
      error: 'Failed to delete batch', 
      details: error.message 
    }, 500)
  }
})

// Get batch summary with enriched specimen data
controls.get('/batches/:id/summary', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

    // Get batch with definition (filtered to blood controls)
    const batchWithDefinition = await db
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

    if (!batchWithDefinition) {
      return c.json({ error: 'Blood control batch not found' }, 404)
    }

    const batchDataRaw = batchWithDefinition.batch
    const definitionData = batchWithDefinition.definition

    // Parse properties to get strain/density info
    const allStrains = await db.select().from(strain)
    const strainMap = new Map(allStrains.map(s => [s.id, { name: s.name }]))
    
    const parsedProps = definitionData ? parseControlProperties(definitionData.properties, strainMap) : null

    // If we have targetDensityUnitId but no unitSymbol, look it up from the database
    let unitSymbol = parsedProps?.unitSymbol
    if (parsedProps?.targetDensityUnitId && !unitSymbol) {
      const unitRecord = await db
        .select({ symbol: unit.symbol })
        .from(unit)
        .where(eq(unit.id, parsedProps.targetDensityUnitId))
        .get()
      if (unitRecord) {
        unitSymbol = unitRecord.symbol
      }
    }

    const batchData = {
      ...batchDataRaw,
      definition: definitionData ? {
        id: definitionData.id,
        name: definitionData.name,
        controlType: definitionData.controlType,
        targetDensity: parsedProps?.targetDensity,
        targetDensityUnitId: parsedProps?.targetDensityUnitId,
        unitSymbol: unitSymbol,
      } : undefined
    }

    const batch = {
      ...batchData,
      composition: parsedProps && parsedProps.strains.length > 0 ? { strains: parsedProps.strains } : null
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

    // Get container type information with collection names and locations
    const [micronixTubesList, cryovialBoxesList, sheetsList, bagsList, staticWellsList] = await Promise.all([
      (containerIds.length > 0
        ? db
            .select({ 
              id: micronixTube.id, 
              collectionId: micronixTube.collectionId,
              barcode: micronixTube.barcode,
              position: micronixTube.position,
              collectionName: micronixPlate.name,
              locationPath: location.path,
              locationName: location.name,
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
              locationPath: location.path,
              locationName: location.name,
            })
            .from(cryovialTube)
            .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
            .leftJoin(location, eq(cryovialBox.locationId, location.id))
            .where(inArray(cryovialTube.id, containerIds))
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
              locationPath: location.path,
              locationName: location.name,
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
      if (!loc) return parentName || undefined
      // Use the materialized path if available, otherwise use name
      if (loc.locationPath) {
        return parentName ? `${loc.locationPath} → ${parentName}` : loc.locationPath
      }
      if (loc.locationName) {
        return parentName ? `${loc.locationName} → ${parentName}` : loc.locationName
      }
      return parentName || undefined
    }
    
    micronixTubesList.forEach(t => containerInfoMap.set(t.id, { type: 'micronix_tube', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.collectionId, locationPath: formatLocPath(t) }))
    cryovialBoxesList.forEach(t => containerInfoMap.set(t.id, { type: 'cryovial_tube', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.collectionId, locationPath: formatLocPath(t) }))
    
    // For papers, we need to fetch the parent location separately if it's nested
    for (const t of sheetsList) {
      let locPath: string | undefined
      if (t.boxId) {
        const res = await db
          .select({ 
            box: box, 
            locationPath: location.path,
            locationName: location.name,
          })
          .from(box)
          .leftJoin(location, eq(box.locationId, location.id))
          .where(eq(box.id, t.boxId))
          .get()
        locPath = formatLocPath(res, res?.box.name)
      } else if (t.bagId) {
        const res = await db
          .select({ 
            bag: bag, 
            locationPath: location.path,
            locationName: location.name,
          })
          .from(bag)
          .leftJoin(location, eq(bag.locationId, location.id))
          .where(eq(bag.id, t.bagId))
          .get()
        locPath = formatLocPath(res, res?.bag.name)
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
      collections: Set<string>
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

// List all control definitions (filtered to blood controls)
controls.get('/', async (c) => {
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
      sql`EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
          EXISTS (SELECT 1 FROM cryovial_tube WHERE cryovial_tube.id = ${storageContainer.id}) OR
          EXISTS (SELECT 1 FROM static_well WHERE static_well.id = ${storageContainer.id})`
    )
    .groupBy(controlBatch.controlDefinitionId)
    .as('tube_counts')

  // Get all strains for name lookup
  const allStrains = await db.select().from(strain)
  const strainMap = new Map(allStrains.map(s => [s.id, { name: s.name }]))

  const query = db
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
      tubeCount: sql<number>`COALESCE(${tubeCountSubquery.count}, 0)`,
      inventoryTotal: sql<number>`COALESCE(${spotCountSubquery.count}, 0) + COALESCE(${tubeCountSubquery.count}, 0)`,
    })
    .from(controlDefinition)
    .leftJoin(batchCountSubquery, eq(controlDefinition.id, batchCountSubquery.definitionId))
    .leftJoin(specimenCountSubquery, eq(controlDefinition.id, specimenCountSubquery.definitionId))
    .leftJoin(spotCountSubquery, eq(controlDefinition.id, spotCountSubquery.definitionId))
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
controls.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid blood control ID' }, 400)
  }

  const control = await db
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
controls.get('/:id/summary', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid control ID' }, 400)

  try {
    // 1. Get control definition (filtered to blood controls)
    const control = await db
      .select({
        id: controlDefinition.id,
        name: controlDefinition.name,
        controlType: controlDefinition.controlType,
        properties: controlDefinition.properties,
        created: controlDefinition.created,
      })
      .from(controlDefinition)
      .where(and(
        eq(controlDefinition.id, id),
        eq(controlDefinition.controlType, 'blood')
      ))
      .get()

    if (!control) return c.json({ error: 'Blood control not found' }, 404)

    // 2. Parse properties to get strain/density info
    const allStrains = await db.select().from(strain)
    const strainMap = new Map(allStrains.map(s => [s.id, { name: s.name }]))
    const parsed = parseControlProperties(control.properties, strainMap)
    
    // If we have targetDensityUnitId but no unitSymbol, look it up from the database
    let unitSymbol = parsed.unitSymbol
    if (parsed.targetDensityUnitId && !unitSymbol) {
      const unitRecord = await db
        .select({ symbol: unit.symbol })
        .from(unit)
        .where(eq(unit.id, parsed.targetDensityUnitId))
        .get()
      if (unitRecord) {
        unitSymbol = unitRecord.symbol
      }
    }
    
    const controlWithParsed = {
      ...control,
      targetDensity: parsed.targetDensity,
      unitSymbol: unitSymbol,
    }
    
    const compositionDetails = parsed.strains.length > 0 ? { strains: parsed.strains } : null

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
          sql`EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
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
      control: controlWithParsed,
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

// Check for duplicate control definition (only checks blood controls)
controls.post('/check-unique', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional().default('blood'),
      targetDensity: z.number().optional(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(z.object({
        strainId: z.number().int(),
        percentage: z.number().min(0).max(100),
      })).optional(),
    })
    
    const data = schema.parse(body)
    // Only check blood controls
    const controlType = 'blood'
    
    // Get all definitions of blood type
    const allDefinitions = await db
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.controlType, controlType))
    
    // Check each definition's properties
    for (const def of allDefinitions) {
      const props = def.properties as any
      if (!props) continue
      
      // Check density match
      if (data.targetDensity !== undefined) {
        if (props.targetDensity !== data.targetDensity) continue
      } else {
        if (props.targetDensity !== undefined && props.targetDensity !== null) continue
      }
      
      // Check unit match
      if (data.targetDensityUnitId !== undefined) {
        if (props.targetDensityUnitId !== data.targetDensityUnitId) continue
      } else {
        if (props.targetDensityUnitId !== undefined && props.targetDensityUnitId !== null) continue
      }
      
      // Check strain composition match
      if (data.strains && data.strains.length > 0) {
        const defStrains = props.strains || []
        if (defStrains.length !== data.strains.length) continue
        
        const strainIds = data.strains.map(s => s.strainId).sort()
        const defStrainIds = defStrains.map((s: any) => (typeof s === 'object' ? s.id : s)).sort()
        
        if (strainIds.length !== defStrainIds.length) continue
        
        const idsMatch = strainIds.every((id, idx) => id === defStrainIds[idx])
        if (!idsMatch) continue
        
        // Check percentages match
        const strainMap = new Map(data.strains.map(s => [s.strainId, s.percentage]))
        const defStrainMap = new Map(defStrains.map((s: any) => [
          typeof s === 'object' ? s.id : s,
          typeof s === 'object' ? s.percentage : undefined
        ]))
        
        const percentagesMatch = strainIds.every(id => {
          const pct = strainMap.get(id)
          const defPct = defStrainMap.get(id)
          return pct !== undefined && defPct !== undefined && defPct !== null && typeof defPct === 'number' && Math.abs(pct - defPct) < 0.01
        })
        
        if (percentagesMatch) {
          return c.json({ exists: true, controlDefinition: def })
        }
      } else {
        // No strains provided, check if definition also has no strains
        const defStrains = props.strains || []
        if (defStrains.length === 0) {
          return c.json({ exists: true, controlDefinition: def })
        }
      }
    }
    
    return c.json({ exists: false })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create control definition (defaults to blood)
controls.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional().default('blood'),
      targetDensity: z.number().optional(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(z.object({
        strainId: z.number().int(),
        percentage: z.number().min(0).max(100),
      })).optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })
    
    const data = schema.parse(body)
    // Ensure controlType is 'blood' for this endpoint
    const controlType = 'blood'
    const { strains, targetDensity, targetDensityUnitId, properties, ...baseData } = data
    
    // Build properties JSON
    const props: any = { ...(properties || {}) }
    
    // For blood controls, add strains and density to properties
    if (controlType === 'blood') {
      if (strains && strains.length > 0) {
        // Get strain names for storage
        const strainIds = strains.map(s => s.strainId)
        const strainRecords = await db
          .select()
          .from(strain)
          .where(inArray(strain.id, strainIds))
        const strainNameMap = new Map(strainRecords.map(s => [s.id, s.name]))
        
        // Validate all strains exist
        const missingStrains = strainIds.filter(id => !strainNameMap.has(id))
        if (missingStrains.length > 0) {
          return c.json({ error: `Invalid strain IDs: ${missingStrains.join(', ')}` }, 400)
        }
        
        props.strains = strains.map(s => ({
          id: s.strainId,
          name: strainNameMap.get(s.strainId)!,
          percentage: s.percentage,
        }))
      }
      if (targetDensity !== undefined && targetDensity !== null) {
        props.targetDensity = targetDensity
      }
      if (targetDensityUnitId !== undefined) {
        // Validate unit exists
        const unitRecord = await db.select().from(unit).where(eq(unit.id, targetDensityUnitId)).get()
        if (!unitRecord) {
          return c.json({ error: `Invalid unit ID: ${targetDensityUnitId}` }, 400)
        }
        props.targetDensityUnitId = targetDensityUnitId
        props.targetDensityUnitSymbol = unitRecord.symbol
      }
    }
    
    const result = await db
      .insert(controlDefinition)
      .values({
        ...baseData,
        controlType,
        properties: Object.keys(props).length > 0 ? props : null,
      })
      .returning()
    
    const newControl = result[0]
    if (!newControl) {
      throw new Error('Failed to create control definition: insert returned no result')
    }
    
    return c.json({ control: newControl }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error creating control definition:', error)
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'A control definition with this name already exists' }, 409)
    }
    return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500)
  }
})

// Update control definition (only blood controls)
controls.patch('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) return c.json({ error: 'Invalid blood control ID' }, 400)

    // Get existing control to merge properties (filtered to blood controls)
    const existing = await db
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
      strains: z.array(z.object({
        strainId: z.number().int(),
        percentage: z.number().min(0).max(100),
      })).optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })
    
    const data = schema.parse(body)
    const { strains, targetDensity, targetDensityUnitId, properties, ...baseData } = data
    
    // Merge properties
    const existingProps = (existing.properties as any) || {}
    const newProps: any = { ...existingProps, ...(properties || {}) }
    
    // Ensure controlType remains 'blood' (don't allow changing it)
    const controlType = 'blood'
    // For blood controls, update strains and density in properties
    if (controlType === 'blood') {
      if (strains !== undefined) {
        if (strains.length > 0) {
          // Get strain names
          const strainIds = strains.map(s => s.strainId)
          const strainRecords = await db
            .select()
            .from(strain)
            .where(inArray(strain.id, strainIds))
          const strainNameMap = new Map(strainRecords.map(s => [s.id, s.name]))
          
          newProps.strains = strains.map(s => ({
            id: s.strainId,
            name: strainNameMap.get(s.strainId) || `Strain ${s.strainId}`,
            percentage: s.percentage,
          }))
        } else {
          // Remove strains
          delete newProps.strains
        }
      }
      if (targetDensity !== undefined) {
        if (targetDensity === null) {
          delete newProps.targetDensity
        } else {
          newProps.targetDensity = targetDensity
        }
      }
      if (targetDensityUnitId !== undefined) {
        if (targetDensityUnitId === null) {
          delete newProps.targetDensityUnitId
          delete newProps.targetDensityUnitSymbol
        } else {
          newProps.targetDensityUnitId = targetDensityUnitId
          const unitRecord = await db.select().from(unit).where(eq(unit.id, targetDensityUnitId)).get()
          if (unitRecord) {
            newProps.targetDensityUnitSymbol = unitRecord.symbol
          }
        }
      }
    }
    
    // Update control definition
    const [updatedControl] = await db
      .update(controlDefinition)
      .set({
        ...baseData,
        properties: Object.keys(newProps).length > 0 ? newProps : null,
        lastUpdated: sql`current_timestamp`,
      })
      .where(eq(controlDefinition.id, id))
      .returning()
    
    return c.json({ control: updatedControl })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error updating control definition:', error)
    const isDevelopment = process.env.NODE_ENV !== 'production'
    return c.json({ 
      error: error?.message || 'Failed to update control definition',
      ...(isDevelopment && { 
        details: error?.message,
        stack: error?.stack 
      }),
      ...(!isDevelopment && { 
        errorCode: 'UPDATE_CONTROL_ERROR'
      })
    }, 500)
  }
})

// List batches for a definition (filtered to blood controls)
controls.get('/:id/batches', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid blood control ID' }, 400)

  // Verify definition is a blood control
  const definition = await db
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

  const batches = await db
    .select()
    .from(controlBatch)
    .where(eq(controlBatch.controlDefinitionId, id))
    .orderBy(desc(controlBatch.productionDate))

  return c.json({ batches })
})

// Create a new batch (only for blood controls)
controls.post('/:id/batches', async (c) => {
  try {
    const definitionId = parseInt(c.req.param('id'))
    if (isNaN(definitionId)) return c.json({ error: 'Invalid blood control ID' }, 400)

    // Verify definition is a blood control
    const definition = await db
      .select()
      .from(controlDefinition)
      .where(and(
        eq(controlDefinition.id, definitionId),
        eq(controlDefinition.controlType, 'blood')
      ))
      .get()

    if (!definition) {
      return c.json({ error: 'Blood control definition not found' }, 404)
    }

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

// Create batch with specimens
controls.post('/batches/create-with-specimens', async (c) => {
  try {
    const body = await c.req.json()
    const { createBatchWithSpecimens } = await import('../lib/control-batch-creation')
    const result = await createBatchWithSpecimens(body)
    return c.json(result, 201)
  } catch (error: any) {
    console.error('Error creating batch with specimens:', error)
    return c.json({ error: error.message || 'Failed to create batch with specimens' }, 500)
  }
})

// Add specimens to existing batch
controls.post('/batches/:id/specimens/bulk', async (c) => {
  try {
    const batchId = parseInt(c.req.param('id'))
    if (isNaN(batchId)) return c.json({ error: 'Invalid batch ID' }, 400)

    const body = await c.req.json()
    const { addSpecimensToBatch } = await import('../lib/control-batch-creation')
    const result = await addSpecimensToBatch(batchId, body)
    return c.json(result, 201)
  } catch (error: any) {
    console.error('Error adding specimens to batch:', error)
    return c.json({ error: error.message || 'Failed to add specimens to batch' }, 500)
  }
})

// Validate CSV
controls.post('/batches/validate-csv', async (c) => {
  try {
    const body = await c.req.json()
    const { csvText } = body

    if (!csvText || typeof csvText !== 'string') {
      return c.json({ error: 'CSV text is required' }, 400)
    }

    // Parse CSV (simplified - just check format)
    const lines = csvText.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      return c.json({
        valid: false,
        errors: [{ row: 0, error: 'CSV must have at least a header and one data row' }],
        preview: [],
      })
    }

    const header = lines[0].split(',').map(h => h.trim().toLowerCase())
    const requiredColumns = ['specimen_type_name']
    const missingColumns = requiredColumns.filter(col => !header.includes(col))

    if (missingColumns.length > 0) {
      return c.json({
        valid: false,
        errors: [{ row: 0, error: `Missing required columns: ${missingColumns.join(', ')}` }],
        preview: [],
      })
    }

    // Validate specimen types exist
    const specimenTypeNames = new Set<string>()
    const errors: Array<{ row: number; field?: string; error: string }> = []

    for (let i = 1; i < Math.min(lines.length, 11); i++) {
      const row = lines[i].split(',')
      const specimenTypeIdx = header.indexOf('specimen_type_name')
      if (specimenTypeIdx >= 0 && row[specimenTypeIdx]) {
        const typeName = row[specimenTypeIdx].trim()
        if (typeName) {
          specimenTypeNames.add(typeName)
        }
      }
    }

    // Check if specimen types exist
    const allSpecimenTypes = await db.select().from(specimenType)
    const existingTypeNames = new Set(allSpecimenTypes.map(t => t.name))

    for (const typeName of specimenTypeNames) {
      if (!existingTypeNames.has(typeName)) {
        errors.push({ row: 0, error: `Unknown specimen type: ${typeName}` })
      }
    }

    // Generate preview
    const preview = lines.slice(1, 6).map((line, idx) => {
      const values = line.split(',')
      const obj: Record<string, any> = {}
      header.forEach((h, i) => {
        obj[h] = values[i]?.trim() || ''
      })
      return obj
    })

    return c.json({
      valid: errors.length === 0,
      errors,
      preview,
    })
  } catch (error: any) {
    console.error('Error validating CSV:', error)
    return c.json({ error: 'Failed to validate CSV', details: error.message }, 500)
  }
})

export default controls
