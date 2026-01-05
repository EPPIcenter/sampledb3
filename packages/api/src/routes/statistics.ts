import { Hono } from 'hono'
import { db } from '../db/client'
import {
  specimen,
  storageContainer,
  studySubject,
  study,
  specimenType,
  tag,
  storageContainerTag,
  location,
  micronixTube,
  micronixPlate,
  cryovialTube,
  cryovialBox,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, or, sql, gte, lte, inArray, isNull } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

const statistics = new Hono()

// Helper to build date filter conditions
function buildDateFilter(column: SQLiteColumn, dateFrom?: string, dateTo?: string) {
  const conditions: ReturnType<typeof gte>[] = []
  if (dateFrom) {
    conditions.push(gte(column, dateFrom))
  }
  if (dateTo) {
    conditions.push(lte(column, dateTo))
  }
  return conditions
}

// Helper to batch array into chunks
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

// Helper to get container types for multiple container IDs (batched to avoid SQLite variable limit)
// Optimized to use parallel queries instead of sequential
async function getContainerTypes(containerIds: number[]): Promise<Map<number, string>> {
  if (containerIds.length === 0) return new Map()
  
  const BATCH_SIZE = 500 // SQLite limit is ~999, use 500 to be safe
  const chunks = chunkArray(containerIds, BATCH_SIZE)
  
  const typeMap = new Map<number, string>()
  
  // Process all chunks in parallel for better performance
  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const [micronixTubes, cryovialTubes, papers, staticWells] = await Promise.all([
        db.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.id, chunk)),
        db.select({ id: cryovialTube.id }).from(cryovialTube).where(inArray(cryovialTube.id, chunk)),
        db.select({ id: paper.id }).from(paper).where(inArray(paper.id, chunk)),
        db.select({ id: staticWell.id }).from(staticWell).where(inArray(staticWell.id, chunk)),
      ])

      const chunkMap = new Map<number, string>()
      micronixTubes.forEach(t => chunkMap.set(t.id, 'micronix_tube'))
      cryovialTubes.forEach(t => chunkMap.set(t.id, 'cryovial_tube'))
      papers.forEach(t => chunkMap.set(t.id, 'paper'))
      staticWells.forEach(t => chunkMap.set(t.id, 'static_well'))
      return chunkMap
    })
  )
  
  // Merge all chunk maps
  chunkResults.forEach(chunkMap => {
    chunkMap.forEach((type, id) => typeMap.set(id, type))
  })
  
  return typeMap
}

statistics.get('/', async (c) => {
  try {
    console.log('[STATS] Starting statistics request')
    // Parse query parameters
    const studyCode = c.req.query('study')
    const sourceType = c.req.query('source_type')
    const specimenTypeId = c.req.query('specimen_type_id')
    const containerType = c.req.query('container_type')
    // Parse tag_ids - handle both tag_ids=1&tag_ids=2 and tag_ids[]=1&tag_ids[]=2 formats
    const tagIdsParam = c.req.queries('tag_ids') || c.req.queries('tag_ids[]')
    const tagIds = tagIdsParam?.map(id => parseInt(id)).filter(id => !isNaN(id))
    const locationId = c.req.query('location_id')
    const collectionDateFrom = c.req.query('collection_date_from')
    const collectionDateTo = c.req.query('collection_date_to')
    const createdFrom = c.req.query('created_from')
    const createdTo = c.req.query('created_to')
    
    console.log('[STATS] Query params:', {
      studyCode,
      sourceType,
      specimenTypeId,
      containerType,
      tagIds,
      tagIdsLength: tagIds?.length,
      locationId,
    })
    
    // Debug: Check raw query params
    const rawTagIds = c.req.queries('tag_ids')
    console.log('[STATS] Raw tag_ids query param:', rawTagIds)

    // Build specimen filter conditions
    const specimenConditions = []
    
    // Filter by study
    let subjectIds: number[] = []
    if (studyCode) {
      const studyRecord = await db
        .select()
        .from(study)
        .where(eq(study.shortCode, studyCode))
        .get()
      
      if (studyRecord) {
        const subjects = await db
          .select({ id: studySubject.id })
          .from(studySubject)
          .where(eq(studySubject.studyId, studyRecord.id))
        subjectIds = subjects.map(s => s.id)
        if (subjectIds.length > 0) {
          if (subjectIds.length === 1) {
            specimenConditions.push(
              eq(specimen.studySubjectId, subjectIds[0])
            )
          } else {
            specimenConditions.push(
              inArray(specimen.studySubjectId, subjectIds)
            )
          }
        } else {
          // No subjects in study, return empty results
          return c.json({
            specimens: {
              total: 0,
              bySourceType: {},
              bySpecimenType: {},
              byStudy: {},
              collectionTimeline: [],
              creationTimeline: [],
            },
            containers: {
              total: 0,
              byType: {},
              byTags: {},
              byStatus: {},
              averagePerSpecimen: 0,
            },
            storage: {
              byLocation: [],
              byRootLocation: {},
            },
          })
        }
      }
    }

    if (sourceType === 'subject') {
      specimenConditions.push(sql`${specimen.studySubjectId} IS NOT NULL`)
    } else if (sourceType === 'control') {
      specimenConditions.push(sql`${specimen.controlBatchId} IS NOT NULL`)
    }

    if (specimenTypeId) {
      const typeId = parseInt(specimenTypeId)
      if (!isNaN(typeId)) {
        specimenConditions.push(eq(specimen.specimenTypeId, typeId))
      }
    }

    // Date filters for specimens
    const collectionDateFilters = buildDateFilter(specimen.collectionDate, collectionDateFrom, collectionDateTo)
    const createdDateFilters = buildDateFilter(specimen.created, createdFrom, createdTo)
    specimenConditions.push(...collectionDateFilters, ...createdDateFilters)

    // Get filtered specimens
    console.log('[STATS] Querying filtered specimens, conditions:', specimenConditions.length)
    let specimenQuery = db.select().from(specimen)
    if (specimenConditions.length > 0) {
      specimenQuery = specimenQuery.where(and(...specimenConditions) as any) as any
    }
    const filteredSpecimens = await specimenQuery
    console.log('[STATS] Found', filteredSpecimens.length, 'specimens')

    const specimenIds = filteredSpecimens.map(s => s.id)

    // Specimen Statistics
    const specimenTotal = filteredSpecimens.length

    // By source type
    const bySourceType: Record<string, number> = {}
    filteredSpecimens.forEach(s => {
      const type = s.studySubjectId ? 'subject' : s.controlBatchId ? 'control' : 'unknown'
      bySourceType[type] = (bySourceType[type] || 0) + 1
    })

    // By specimen type
    const specimenTypeIds = [...new Set(filteredSpecimens.map(s => s.specimenTypeId))]
    const specimenTypes = specimenTypeIds.length > 0
      ? await db.select().from(specimenType).where(inArray(specimenType.id, specimenTypeIds))
      : []
    const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))
    
    const bySpecimenType: Record<string, number> = {}
    filteredSpecimens.forEach(s => {
      const typeName = specimenTypeMap.get(s.specimenTypeId) || 'Unknown'
      bySpecimenType[typeName] = (bySpecimenType[typeName] || 0) + 1
    })

    // By study
    const byStudy: Record<string, number> = {}
    if (subjectIds.length > 0 || !studyCode) {
      // Get all subjects for specimens
      const subjectSpecimens = filteredSpecimens.filter(s => s.studySubjectId)
      const uniqueSubjectIds = [...new Set(subjectSpecimens.map(s => s.studySubjectId!))]
      
      if (uniqueSubjectIds.length > 0) {
        // Batch query to avoid SQLite variable limit
        const BATCH_SIZE = 500
        const subjectChunks = chunkArray(uniqueSubjectIds, BATCH_SIZE)
        const allSubjects: Array<{ id: number; studyId: number }> = []
        
        for (const chunk of subjectChunks) {
          const subjects = await db
            .select({
              id: studySubject.id,
              studyId: studySubject.studyId,
            })
            .from(studySubject)
            .where(inArray(studySubject.id, chunk))
          allSubjects.push(...subjects)
        }
        
        const studyIds = [...new Set(allSubjects.map(s => s.studyId))]
        if (studyIds.length > 0) {
          const studies = await db
            .select()
            .from(study)
            .where(inArray(study.id, studyIds))
          
          const studyMap = new Map(studies.map(s => [s.id, s.shortCode]))
          const subjectStudyMap = new Map(allSubjects.map(s => [s.id, studyMap.get(s.studyId)]))
          
          subjectSpecimens.forEach(s => {
            const studyCode = subjectStudyMap.get(s.studySubjectId!)
            if (studyCode) {
              byStudy[studyCode] = (byStudy[studyCode] || 0) + 1
            }
          })
        }
      }
    }

    // Collection timeline (monthly)
    const collectionTimeline: { date: string; count: number }[] = []
    const collectionMap = new Map<string, number>()
    filteredSpecimens
      .filter(s => s.collectionDate)
      .forEach(s => {
        const date = new Date(s.collectionDate!)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        collectionMap.set(monthKey, (collectionMap.get(monthKey) || 0) + 1)
      })
    Array.from(collectionMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, count]) => {
        collectionTimeline.push({ date, count })
      })

    // Creation timeline (monthly)
    const creationTimeline: { date: string; count: number }[] = []
    const creationMap = new Map<string, number>()
    filteredSpecimens.forEach(s => {
      const date = new Date(s.created)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      creationMap.set(monthKey, (creationMap.get(monthKey) || 0) + 1)
    })
    Array.from(creationMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, count]) => {
        creationTimeline.push({ date, count })
      })

    // Location Filtering - Query matching location IDs and their descendants
    const hasLocationFilter = !!locationId
    let filteredLocationIds: number[] = []
    
    if (hasLocationFilter) {
      console.log('[STATS] Processing location filter')
      const id = parseInt(locationId!)
      if (!isNaN(id)) {
        // Get the location and all its descendants
        const targetLocation = await db
          .select()
          .from(location)
          .where(eq(location.id, id))
          .get()
        
        if (targetLocation) {
          // Get all descendants of this location
          const { getLocationDescendants } = await import('../lib/location-helpers')
          const descendants = await getLocationDescendants(id)
          filteredLocationIds = [id, ...descendants.map(d => d.id)]
          console.log('[STATS] Found', filteredLocationIds.length, 'locations (including descendants)')
        } else {
          console.log('[STATS] Location not found, returning empty results')
          // Location not found, return empty results
          return c.json({
            specimens: {
              total: 0,
              bySourceType: {},
              bySpecimenType: {},
              byStudy: {},
              collectionTimeline: [],
              creationTimeline: [],
            },
            containers: {
              total: 0,
              byType: {},
              byTags: {},
              byStatus: {},
              averagePerSpecimen: 0,
            },
            storage: {
              byLocation: [],
              byRootLocation: {},
            },
          })
        }
      }
    }

    // Get container IDs filtered by tags if tag filter is provided
    // Using AND logic: containers must have ALL selected tags
    let tagFilteredContainerIds: number[] | null = null
    if (tagIds && tagIds.length > 0) {
      console.log('[STATS] Querying containers by tags (AND logic):', tagIds)
      
      // For AND logic, find containers that have all selected tags
      // Query containers for each tag and find the intersection
      const containerSets: Set<number>[] = []
      
      for (const tagId of tagIds) {
        const containersWithTag = await db
          .select({ containerId: storageContainerTag.storageContainerId })
          .from(storageContainerTag)
          .where(eq(storageContainerTag.tagId, tagId))
        containerSets.push(new Set(containersWithTag.map(ct => ct.containerId)))
      }
      
      // Find intersection: containers that appear in all sets
      if (containerSets.length > 0) {
        let intersection = containerSets[0]
        for (let i = 1; i < containerSets.length; i++) {
          intersection = new Set([...intersection].filter(id => containerSets[i].has(id)))
        }
        tagFilteredContainerIds = Array.from(intersection)
      } else {
        tagFilteredContainerIds = []
      }
      
      console.log('[STATS] Found', tagFilteredContainerIds.length, 'containers with all selected tags')
      if (tagFilteredContainerIds.length === 0) {
        // No containers match all the tags, return empty results
        return c.json({
          specimens: {
            total: 0,
            bySourceType: {},
            bySpecimenType: {},
            byStudy: {},
            collectionTimeline: [],
            creationTimeline: [],
          },
          containers: {
            total: 0,
            byType: {},
            byTags: {},
            byStatus: {},
            averagePerSpecimen: 0,
          },
          storage: {
            byLocation: [],
            byRootLocation: {},
          },
        })
      }
    }

    // Container Statistics
    // Use efficient joins when location filter is present
    let filteredContainers: Array<typeof storageContainer.$inferSelect> = []

    if (specimenIds.length > 0) {
      // Get location-filtered container IDs once (if location filter is active)
      let locationFilteredContainerIds: number[] | null = null
      if (hasLocationFilter && filteredLocationIds.length > 0) {
        console.log('[STATS] Querying containers by location (all specimens)')
        // Query container IDs by matching location IDs (avoiding circular references)
        // First, get plates/boxes that match the location IDs
        console.log('[STATS] Step 1: Querying plates/boxes for', filteredLocationIds.length, 'locations')
        const [matchingPlates, matchingBoxes] = await Promise.all([
          db.select({ id: micronixPlate.id })
            .from(micronixPlate)
            .where(inArray(micronixPlate.locationId, filteredLocationIds)),
          db.select({ id: cryovialBox.id })
            .from(cryovialBox)
            .where(inArray(cryovialBox.locationId, filteredLocationIds)),
        ])
        console.log('[STATS] Found', matchingPlates.length, 'plates and', matchingBoxes.length, 'boxes')
        
        const plateIds = matchingPlates.map(p => p.id)
        const boxIds = matchingBoxes.map(b => b.id)
        
        // Then get container IDs from those plates/boxes
        console.log('[STATS] Step 2: Querying containers from plates/boxes')
        const [micronixContainerIds, cryovialContainerIds] = await Promise.all([
          plateIds.length > 0
            ? db.select({ id: micronixTube.id })
                .from(micronixTube)
                .where(inArray(micronixTube.collectionId, plateIds))
            : Promise.resolve([]),
          boxIds.length > 0
            ? db.select({ id: cryovialTube.id })
                .from(cryovialTube)
                .where(inArray(cryovialTube.collectionId, boxIds))
            : Promise.resolve([]),
        ])
        console.log('[STATS] Found', micronixContainerIds.length, 'micronix and', cryovialContainerIds.length, 'cryovial containers')
        
        // Combine container IDs
        locationFilteredContainerIds = [
          ...new Set([
            ...micronixContainerIds.map(r => r.id),
            ...cryovialContainerIds.map(r => r.id),
          ])
        ]
        
        // Apply tag filter if provided
        if (tagFilteredContainerIds) {
          locationFilteredContainerIds = locationFilteredContainerIds.filter(id => tagFilteredContainerIds!.includes(id))
        }
        console.log('[STATS] Total location-filtered container IDs:', locationFilteredContainerIds.length)
      }
      
      // Batch query if too many specimen IDs to avoid SQLite variable limit
      // Use Promise.all to parallelize queries for better performance
      const specimenChunks = chunkArray(specimenIds, 500)
      console.log('[STATS] Processing', specimenChunks.length, 'specimen chunks in parallel')
      
      const chunkResults = await Promise.all(
        specimenChunks.map(async (specimenChunk, chunkIndex) => {
          let containerQuery = db.select().from(storageContainer)
          const containerConditions = [inArray(storageContainer.specimenId, specimenChunk)]
          
          // Apply location filter if provided
          if (locationFilteredContainerIds) {
            containerConditions.push(inArray(storageContainer.id, locationFilteredContainerIds))
          }
          
          // Apply tag filter if provided
          if (tagFilteredContainerIds) {
            containerConditions.push(inArray(storageContainer.id, tagFilteredContainerIds))
          }

          containerQuery = containerQuery.where(and(...containerConditions) as any) as any
          const containers = await containerQuery
          console.log('[STATS] Chunk', chunkIndex + 1, 'of', specimenChunks.length, 'found', containers.length, 'containers')
          return containers
        })
      )
      
      // Flatten results
      filteredContainers = chunkResults.flat()
      
      // Remove duplicates (in case a container appears in multiple chunks - shouldn't happen, but be safe)
      const seenIds = new Set<number>()
      filteredContainers = filteredContainers.filter(c => {
        if (seenIds.has(c.id)) {
          return false
        }
        seenIds.add(c.id)
        return true
      })
    } else if (filteredSpecimens.length === 0) {
      // No specimens match, so no containers
      return c.json({
        specimens: {
          total: 0,
          bySourceType: {},
          bySpecimenType: {},
          byStudy: {},
          collectionTimeline: [],
          creationTimeline: [],
        },
        containers: {
          total: 0,
          byType: {},
          byState: {},
          byStatus: {},
          averagePerSpecimen: 0,
        },
        storage: {
          byLocation: [],
          byRootLocation: {},
        },
      })
    } else {
      // No specimen filter, but we might have state/status/location filters
      if (hasLocationFilter && filteredLocationIds.length > 0) {
        console.log('[STATS] Querying containers by location (no specimen filter)')
        // Query container IDs by matching location IDs (avoiding circular references)
        // First, get plates/boxes that match the location IDs
        console.log('[STATS] Step 1: Querying plates/boxes for', filteredLocationIds.length, 'locations')
        const [matchingPlates, matchingBoxes] = await Promise.all([
          db.select({ id: micronixPlate.id })
            .from(micronixPlate)
            .where(inArray(micronixPlate.locationId, filteredLocationIds)),
          db.select({ id: cryovialBox.id })
            .from(cryovialBox)
            .where(inArray(cryovialBox.locationId, filteredLocationIds)),
        ])
        console.log('[STATS] Found', matchingPlates.length, 'plates and', matchingBoxes.length, 'boxes')
        
        const plateIds = matchingPlates.map(p => p.id)
        const boxIds = matchingBoxes.map(b => b.id)
        
        // Then get container IDs from those plates/boxes
        console.log('[STATS] Step 2: Querying containers from plates/boxes')
        const [micronixContainerIds, cryovialContainerIds] = await Promise.all([
          plateIds.length > 0
            ? db.select({ id: micronixTube.id })
                .from(micronixTube)
                .where(inArray(micronixTube.collectionId, plateIds))
            : Promise.resolve([]),
          boxIds.length > 0
            ? db.select({ id: cryovialTube.id })
                .from(cryovialTube)
                .where(inArray(cryovialTube.collectionId, boxIds))
            : Promise.resolve([]),
        ])
        console.log('[STATS] Found', micronixContainerIds.length, 'micronix and', cryovialContainerIds.length, 'cryovial containers')
        
        // Combine container IDs
        const locationFilteredContainerIds = [
          ...new Set([
            ...micronixContainerIds.map(r => r.id),
            ...cryovialContainerIds.map(r => r.id),
          ])
        ]
        
        if (locationFilteredContainerIds.length === 0) {
          filteredContainers = []
        } else {
          // Fetch containers matching location and other filters
          const containerIdChunks = chunkArray(locationFilteredContainerIds, 500)
          for (const containerIdChunk of containerIdChunks) {
            let containerQuery = db.select().from(storageContainer)
            const containerConditions = [inArray(storageContainer.id, containerIdChunk)]

            // Apply tag filter if provided
            if (tagFilteredContainerIds) {
              containerConditions.push(inArray(storageContainer.id, tagFilteredContainerIds))
            }

            containerQuery = containerQuery.where(and(...containerConditions) as any) as any
            const chunkContainers = await containerQuery
            filteredContainers.push(...chunkContainers)
          }
        }
      } else {
        // No location filter
        let containerQuery = db.select().from(storageContainer)
        const containerConditions = []

        // Apply tag filter if provided
        if (tagFilteredContainerIds) {
          containerConditions.push(inArray(storageContainer.id, tagFilteredContainerIds))
        }

        if (containerConditions.length > 0) {
          containerQuery = containerQuery.where(and(...containerConditions) as any) as any
        }
        filteredContainers = await containerQuery
      }
    }

    // Get container types in batch
    const containerIds = filteredContainers.map(c => c.id)
    const containerTypeMap = await getContainerTypes(containerIds)

    // Filter by container type if specified (before calculating totals)
    let finalContainers = filteredContainers
    if (containerType) {
      finalContainers = filteredContainers.filter(container => 
        containerTypeMap.get(container.id) === containerType
      )
    }

    const containerTotal = finalContainers.length

    // Recalculate specimen total based on filtered containers
    // Only count specimens that have containers matching the filters
    const filteredSpecimenIds = [...new Set(finalContainers.map(c => c.specimenId))]
    let adjustedSpecimenTotal = specimenTotal
    let adjustedSpecimens = filteredSpecimens
    
    // If we filtered containers (by type, state, or location), recalculate specimen stats
    if (containerType || tagFilteredContainerIds || hasLocationFilter) {
      // If we filtered containers, only count specimens that have matching containers
      adjustedSpecimenTotal = filteredSpecimenIds.length
      
      // Filter specimens to only those with matching containers
      if (filteredSpecimenIds.length > 0) {
        const specimenIdSet = new Set(filteredSpecimenIds)
        adjustedSpecimens = filteredSpecimens.filter(s => specimenIdSet.has(s.id))
      } else {
        adjustedSpecimens = []
      }
      
      // Recalculate all specimen statistics based on adjusted specimens
      // By source type
      const adjustedBySourceType: Record<string, number> = {}
      adjustedSpecimens.forEach(s => {
        const type = s.studySubjectId ? 'subject' : s.controlBatchId ? 'control' : 'unknown'
        adjustedBySourceType[type] = (adjustedBySourceType[type] || 0) + 1
      })
      Object.keys(bySourceType).forEach(key => delete bySourceType[key])
      Object.assign(bySourceType, adjustedBySourceType)
      
      // By specimen type
      const adjustedSpecimenTypeIds = [...new Set(adjustedSpecimens.map(s => s.specimenTypeId))]
      const adjustedSpecimenTypes = adjustedSpecimenTypeIds.length > 0
        ? await db.select().from(specimenType).where(inArray(specimenType.id, adjustedSpecimenTypeIds))
        : []
      const adjustedSpecimenTypeMap = new Map(adjustedSpecimenTypes.map(st => [st.id, st.name]))
      
      const adjustedBySpecimenType: Record<string, number> = {}
      adjustedSpecimens.forEach(s => {
        const typeName = adjustedSpecimenTypeMap.get(s.specimenTypeId) || 'Unknown'
        adjustedBySpecimenType[typeName] = (adjustedBySpecimenType[typeName] || 0) + 1
      })
      Object.keys(bySpecimenType).forEach(key => delete bySpecimenType[key])
      Object.assign(bySpecimenType, adjustedBySpecimenType)
      
      // By study
      const adjustedSubjectSpecimens = adjustedSpecimens.filter(s => s.studySubjectId)
      const adjustedUniqueSubjectIds = [...new Set(adjustedSubjectSpecimens.map(s => s.studySubjectId!))]
      
      if (adjustedUniqueSubjectIds.length > 0) {
        const BATCH_SIZE = 500
        const adjustedSubjectChunks = chunkArray(adjustedUniqueSubjectIds, BATCH_SIZE)
        const adjustedAllSubjects: Array<{ id: number; studyId: number }> = []
        
        for (const chunk of adjustedSubjectChunks) {
          const subjects = await db
            .select({
              id: studySubject.id,
              studyId: studySubject.studyId,
            })
            .from(studySubject)
            .where(inArray(studySubject.id, chunk))
          adjustedAllSubjects.push(...subjects)
        }
        
        const adjustedStudyIds = [...new Set(adjustedAllSubjects.map(s => s.studyId))]
        if (adjustedStudyIds.length > 0) {
          const studies = await db
            .select()
            .from(study)
            .where(inArray(study.id, adjustedStudyIds))
          
          const studyMap = new Map(studies.map(s => [s.id, s.shortCode]))
          const subjectStudyMap = new Map(adjustedAllSubjects.map(s => [s.id, studyMap.get(s.studyId)]))
          
          const adjustedByStudy: Record<string, number> = {}
          adjustedSubjectSpecimens.forEach(s => {
            const studyCode = subjectStudyMap.get(s.studySubjectId!)
            if (studyCode) {
              adjustedByStudy[studyCode] = (adjustedByStudy[studyCode] || 0) + 1
            }
          })
          Object.keys(byStudy).forEach(key => delete byStudy[key])
          Object.assign(byStudy, adjustedByStudy)
        }
      }
      
      // Collection timeline
      const adjustedCollectionTimeline: { date: string; count: number }[] = []
      const adjustedCollectionMap = new Map<string, number>()
      adjustedSpecimens
        .filter(s => s.collectionDate)
        .forEach(s => {
          const date = new Date(s.collectionDate!)
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          adjustedCollectionMap.set(monthKey, (adjustedCollectionMap.get(monthKey) || 0) + 1)
        })
      Array.from(adjustedCollectionMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([date, count]) => {
          adjustedCollectionTimeline.push({ date, count })
        })
      collectionTimeline.length = 0
      collectionTimeline.push(...adjustedCollectionTimeline)
      
      // Creation timeline
      const adjustedCreationTimeline: { date: string; count: number }[] = []
      const adjustedCreationMap = new Map<string, number>()
      adjustedSpecimens.forEach(s => {
        const date = new Date(s.created)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        adjustedCreationMap.set(monthKey, (adjustedCreationMap.get(monthKey) || 0) + 1)
      })
      Array.from(adjustedCreationMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([date, count]) => {
          adjustedCreationTimeline.push({ date, count })
        })
      creationTimeline.length = 0
      creationTimeline.push(...adjustedCreationTimeline)
    }
    const averagePerSpecimen = adjustedSpecimenTotal > 0 ? containerTotal / adjustedSpecimenTotal : 0

    // Containers by type (always use finalContainers to respect all filters)
    const byType: Record<string, number> = {}
    finalContainers.forEach(container => {
      const type = containerTypeMap.get(container.id)
      if (type) {
        byType[type] = (byType[type] || 0) + 1
      }
    })

    // Containers by tags
    const finalContainerIds = finalContainers.map(c => c.id)
    console.log('[STATS] Querying container tags for', finalContainerIds.length, 'containers')
    const containerTags: Array<{ containerId: number; tagId: number; tagName: string }> = []
    
    if (finalContainerIds.length > 0) {
      // Batch query to avoid SQLite variable limit and stack overflow
      const containerIdChunks = chunkArray(finalContainerIds, 500)
      console.log('[STATS] Processing', containerIdChunks.length, 'chunks for container tags')
      
      for (let i = 0; i < containerIdChunks.length; i++) {
        const chunk = containerIdChunks[i]
        console.log('[STATS] Querying container tags chunk', i + 1, 'of', containerIdChunks.length, 'with', chunk.length, 'container IDs')
        const chunkTags = await db
          .select({
            containerId: storageContainerTag.storageContainerId,
            tagId: tag.id,
            tagName: tag.name,
          })
          .from(storageContainerTag)
          .innerJoin(tag, eq(storageContainerTag.tagId, tag.id))
          .where(inArray(storageContainerTag.storageContainerId, chunk))
        console.log('[STATS] Found', chunkTags.length, 'tags in chunk')
        containerTags.push(...chunkTags)
      }
    }
    console.log('[STATS] Found', containerTags.length, 'total container tags')
    
    const byTags: Record<string, number> = {}
    containerTags.forEach(ct => {
      byTags[ct.tagName] = (byTags[ct.tagName] || 0) + 1
    })

    // Containers by status (Inferred from remaining quantity)
    const byStatus: Record<string, number> = {}
    finalContainers.forEach(c => {
      let statusName: string
      if (c.remainingQuantity === null || c.remainingQuantity === undefined) {
        statusName = 'Unknown'
      } else if (c.remainingQuantity > 0) {
        statusName = 'In Use'
      } else {
        statusName = 'Exhausted'
      }
      byStatus[statusName] = (byStatus[statusName] || 0) + 1
    })

    // Storage Statistics
    // Get location IDs from containers via micronix/cryovial plates/boxes
    // Reuse finalContainerIds from above (line 673)
    console.log('[STATS] Querying storage statistics for', finalContainerIds.length, 'containers')
    
    let micronixTubes: Array<{ containerId: number; locationId: number | null }> = []
    let cryovialTubes: Array<{ containerId: number; locationId: number | null }> = []
    
    if (finalContainerIds.length > 0) {
      // Batch queries to avoid SQLite variable limit
      const containerChunks = chunkArray(finalContainerIds, 500)
      console.log('[STATS] Processing', containerChunks.length, 'chunks for storage statistics')
      
      for (let i = 0; i < containerChunks.length; i++) {
        const chunk = containerChunks[i]
        console.log('[STATS] Querying storage chunk', i + 1, 'of', containerChunks.length, 'with', chunk.length, 'container IDs')
        const [micronixBatch, cryovialBatch] = await Promise.all([
          db.select({ containerId: micronixTube.id, locationId: micronixPlate.locationId })
            .from(micronixTube)
            .leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
            .where(inArray(micronixTube.id, chunk)),
          db.select({ containerId: cryovialTube.id, locationId: cryovialBox.locationId })
            .from(cryovialTube)
            .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
            .where(inArray(cryovialTube.id, chunk)),
        ])
        console.log('[STATS] Found', micronixBatch.length, 'micronix and', cryovialBatch.length, 'cryovial in chunk')
        micronixTubes.push(...micronixBatch)
        cryovialTubes.push(...cryovialBatch)
      }
    }

    const locationIds = [
      ...micronixTubes.map(t => t.locationId).filter((id): id is number => id !== null),
      ...cryovialTubes.map(t => t.locationId).filter((id): id is number => id !== null),
    ]

    const byLocation: { location: string; count: number }[] = []
    const byRootLocation: Record<string, number> = {}

    if (locationIds.length > 0) {
      console.log('[STATS] Querying', locationIds.length, 'locations for storage statistics')
      // Batch query to avoid SQLite variable limit
      const locationChunks = chunkArray(locationIds, 500)
      const allLocations: Array<typeof location.$inferSelect> = []
      
      for (let i = 0; i < locationChunks.length; i++) {
        const chunk = locationChunks[i]
        console.log('[STATS] Querying location chunk', i + 1, 'of', locationChunks.length, 'with', chunk.length, 'location IDs')
        const locations = await db
          .select()
          .from(location)
          .where(inArray(location.id, chunk))
        console.log('[STATS] Found', locations.length, 'locations in chunk')
        allLocations.push(...locations)
      }
      
      const locations = allLocations

      const locationMap = new Map(locations.map(l => [l.id, l]))

      // Collect all parent IDs we need to query
      const parentIdsToLoad = new Set<number>()
      locations.forEach(loc => {
        let current: typeof location.$inferSelect | undefined = loc
        while (current?.parentId !== null && current.parentId !== undefined) {
          if (!locationMap.has(current.parentId)) {
            parentIdsToLoad.add(current.parentId)
          }
          // Try to get parent from map, or we'll need to query it
          current = locationMap.get(current.parentId)
          if (!current) break
        }
      })

      // Load missing parent locations
      if (parentIdsToLoad.size > 0) {
        console.log('[STATS] Loading', parentIdsToLoad.size, 'missing parent locations')
        const parentChunks = chunkArray(Array.from(parentIdsToLoad), 500)
        for (const chunk of parentChunks) {
          const parentLocations = await db
            .select()
            .from(location)
            .where(inArray(location.id, chunk))
          parentLocations.forEach(loc => {
            locationMap.set(loc.id, loc)
            locations.push(loc)
          })
        }
        
        // Recursively load any additional parents we discovered
        let additionalParents = new Set<number>()
        locations.forEach(loc => {
          if (loc.parentId !== null && !locationMap.has(loc.parentId)) {
            additionalParents.add(loc.parentId)
          }
        })
        
        // Keep loading until we have all ancestors
        while (additionalParents.size > 0) {
          const parentChunks = chunkArray(Array.from(additionalParents), 500)
          additionalParents = new Set<number>()
          for (const chunk of parentChunks) {
            const parentLocations = await db
              .select()
              .from(location)
              .where(inArray(location.id, chunk))
            parentLocations.forEach(loc => {
              if (!locationMap.has(loc.id)) {
                locationMap.set(loc.id, loc)
                locations.push(loc)
                if (loc.parentId !== null && !locationMap.has(loc.parentId)) {
                  additionalParents.add(loc.parentId)
                }
              }
            })
          }
        }
      }

      // Helper function to find root location by walking up parent chain
      const getRootLocation = (loc: typeof location.$inferSelect): typeof location.$inferSelect => {
        let current = loc
        while (current.parentId !== null && current.parentId !== undefined) {
          const parent = locationMap.get(current.parentId)
          if (!parent) {
            // If parent not found, current is as high as we can go
            break
          }
          current = parent
        }
        return current
      }

      // Count by location path
      const locationCountMap = new Map<string, number>()
      locationIds.forEach(id => {
        const loc = locationMap.get(id)
        if (loc) {
          // Use materialized path if available, otherwise build from name
          const path = loc.path || loc.name || `Location ${loc.id}`
          locationCountMap.set(path, (locationCountMap.get(path) || 0) + 1)
        }
      })

      Array.from(locationCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20) // Top 20 locations
        .forEach(([location, count]) => {
          byLocation.push({ location, count })
        })

      // Count by root location (root location name)
      locationIds.forEach(id => {
        const loc = locationMap.get(id)
        if (loc) {
          const rootLoc = getRootLocation(loc)
          const rootName = rootLoc.name || `Location ${rootLoc.id}`
          byRootLocation[rootName] = (byRootLocation[rootName] || 0) + 1
        }
      })
    }

    console.log('[STATS] Successfully completed statistics request')
    return c.json({
      specimens: {
        total: adjustedSpecimenTotal,
        bySourceType,
        bySpecimenType,
        byStudy,
        collectionTimeline,
        creationTimeline,
      },
      containers: {
        total: containerTotal,
        byType,
        byTags,
        byStatus,
        averagePerSpecimen: Math.round(averagePerSpecimen * 100) / 100,
      },
      storage: {
        byLocation,
        byRootLocation,
      },
    })
  } catch (error: unknown) {
    console.error('[STATS] Error fetching statistics:', error)
    if (error instanceof Error) {
      console.error('[STATS] Error stack:', error.stack)
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isDevelopment = process.env.NODE_ENV !== 'production'
    return c.json({ 
      error: 'Failed to fetch statistics',
      ...(isDevelopment && { 
        details: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      }),
      ...(!isDevelopment && { 
        errorCode: 'STATISTICS_ERROR'
      })
    }, 500)
  }
})

export default statistics

