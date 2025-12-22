import { Hono } from 'hono'
import { db } from '../db/client'
import {
  specimen,
  storageContainer,
  studySubject,
  study,
  specimenType,
  state,
  location,
  micronixTube,
  micronixPlate,
  cryovialTube,
  cryovialBox,
  tube,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, or, sql, gte, lte, inArray } from 'drizzle-orm'

const statistics = new Hono()

// Helper to build date filter conditions
function buildDateFilter(column: any, dateFrom?: string, dateTo?: string) {
  const conditions = []
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
async function getContainerTypes(containerIds: number[]): Promise<Map<number, string>> {
  if (containerIds.length === 0) return new Map()
  
  const BATCH_SIZE = 500 // SQLite limit is ~999, use 500 to be safe
  const chunks = chunkArray(containerIds, BATCH_SIZE)
  
  const typeMap = new Map<number, string>()
  
  // Process each chunk
  for (const chunk of chunks) {
    const [micronixTubes, cryovialTubes, tubes, papers, staticWells] = await Promise.all([
      db.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.id, chunk)),
      db.select({ id: cryovialTube.id }).from(cryovialTube).where(inArray(cryovialTube.id, chunk)),
      db.select({ id: tube.id }).from(tube).where(inArray(tube.id, chunk)),
      db.select({ id: paper.id }).from(paper).where(inArray(paper.id, chunk)),
      db.select({ id: staticWell.id }).from(staticWell).where(inArray(staticWell.id, chunk)),
    ])

    micronixTubes.forEach(t => typeMap.set(t.id, 'micronix_tube'))
    cryovialTubes.forEach(t => typeMap.set(t.id, 'cryovial_tube'))
    tubes.forEach(t => typeMap.set(t.id, 'tube'))
    papers.forEach(t => typeMap.set(t.id, 'paper'))
    staticWells.forEach(t => typeMap.set(t.id, 'static_well'))
  }
  
  return typeMap
}

statistics.get('/', async (c) => {
  try {
    // Parse query parameters
    const studyCode = c.req.query('study')
    const sourceType = c.req.query('source_type')
    const specimenTypeId = c.req.query('specimen_type_id')
    const containerType = c.req.query('container_type')
    const stateId = c.req.query('state_id')
    const locationId = c.req.query('location_id')
    const locationRoot = c.req.query('location_root')
    const locationLevelI = c.req.query('location_level_i')
    const locationLevelII = c.req.query('location_level_ii')
    const collectionDateFrom = c.req.query('collection_date_from')
    const collectionDateTo = c.req.query('collection_date_to')
    const createdFrom = c.req.query('created_from')
    const createdTo = c.req.query('created_to')

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
              byState: {},
              byStatus: {},
              averagePerSpecimen: 0,
            },
            storage: {
              byLocation: [],
              byLocationRoot: [],
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
    let specimenQuery = db.select().from(specimen)
    if (specimenConditions.length > 0) {
      specimenQuery = specimenQuery.where(and(...specimenConditions) as any) as any
    }
    const filteredSpecimens = await specimenQuery

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

    // Location Filtering - Build location conditions for use in joins
    const hasLocationFilter = locationId || locationRoot || locationLevelI || locationLevelII
    const locationConditions: any[] = []
    
    if (hasLocationFilter) {
      if (locationId) {
        const id = parseInt(locationId)
        if (!isNaN(id)) {
          locationConditions.push(eq(location.id, id))
        }
      }
      
      if (locationRoot) {
        locationConditions.push(eq(location.locationRoot, locationRoot))
      }
      
      if (locationLevelI) {
        locationConditions.push(eq(location.levelI, locationLevelI))
      }
      
      if (locationLevelII) {
        locationConditions.push(eq(location.levelII, locationLevelII))
      }
    }

    // Container Statistics
    // Use efficient joins when location filter is present
    let filteredContainers: Array<typeof storageContainer.$inferSelect> = []

    if (specimenIds.length > 0) {
      // Batch query if too many specimen IDs to avoid SQLite variable limit
      const specimenChunks = chunkArray(specimenIds, 500)
      
      for (const specimenChunk of specimenChunks) {
        let containersForSpecimens: Array<typeof storageContainer.$inferSelect> = []
        
        if (hasLocationFilter && locationConditions.length > 0) {
          // Use efficient query with joins to get container IDs in one go
          // Query micronix containers
          const micronixContainerIds = await db
            .select({ id: micronixTube.id })
            .from(micronixTube)
            .leftJoin(micronixPlate, eq(micronixTube.manifestId, micronixPlate.id))
            .leftJoin(location, eq(micronixPlate.locationId, location.id))
            .where(
              and(
                ...locationConditions,
                sql`${micronixTube.id} IS NOT NULL`,
                sql`${micronixPlate.id} IS NOT NULL`,
                sql`${location.id} IS NOT NULL`,
              ) as any
            )
          
          // Query cryovial containers
          const cryovialContainerIds = await db
            .select({ id: cryovialTube.id })
            .from(cryovialTube)
            .leftJoin(cryovialBox, eq(cryovialTube.manifestId, cryovialBox.id))
            .leftJoin(location, eq(cryovialBox.locationId, location.id))
            .where(
              and(
                ...locationConditions,
                sql`${cryovialTube.id} IS NOT NULL`,
                sql`${cryovialBox.id} IS NOT NULL`,
                sql`${location.id} IS NOT NULL`,
              ) as any
            )
          
          // Combine container IDs
          const locationFilteredContainerIds = [
            ...new Set([
              ...micronixContainerIds.map(r => r.id),
              ...cryovialContainerIds.map(r => r.id),
            ])
          ]
          
          if (locationFilteredContainerIds.length === 0) {
            containersForSpecimens = []
          } else {
            // Fetch containers matching both specimen and location filters
            const containerIdChunks = chunkArray(locationFilteredContainerIds, 500)
            for (const containerIdChunk of containerIdChunks) {
              let containerQuery = db.select().from(storageContainer)
              const containerConditions = [
                inArray(storageContainer.specimenId, specimenChunk),
                inArray(storageContainer.id, containerIdChunk),
              ]
              
              if (stateId) {
                const id = parseInt(stateId)
                if (!isNaN(id)) {
                  containerConditions.push(eq(storageContainer.stateId, id))
                }
              }

              containerQuery = containerQuery.where(and(...containerConditions) as any) as any
              const chunkContainers = await containerQuery
              containersForSpecimens.push(...chunkContainers)
            }
          }
        } else {
          // No location filter, just query by specimen chunk
          let containerQuery = db.select().from(storageContainer)
          const containerConditions = [inArray(storageContainer.specimenId, specimenChunk)]
          
          if (stateId) {
            const id = parseInt(stateId)
            if (!isNaN(id)) {
              containerConditions.push(eq(storageContainer.stateId, id))
            }
          }

          containerQuery = containerQuery.where(and(...containerConditions) as any) as any
          containersForSpecimens = await containerQuery
        }
        
        filteredContainers.push(...containersForSpecimens)
      }
      
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
          byLocationRoot: [],
        },
      })
    } else {
      // No specimen filter, but we might have state/status/location filters
      if (hasLocationFilter && locationConditions.length > 0) {
        // Use efficient query with joins to get container IDs
        const micronixContainerIds = await db
          .select({ id: micronixTube.id })
          .from(micronixTube)
          .leftJoin(micronixPlate, eq(micronixTube.manifestId, micronixPlate.id))
          .leftJoin(location, eq(micronixPlate.locationId, location.id))
          .where(
            and(
              ...locationConditions,
              sql`${micronixTube.id} IS NOT NULL`,
              sql`${micronixPlate.id} IS NOT NULL`,
              sql`${location.id} IS NOT NULL`,
            ) as any
          )
        
        const cryovialContainerIds = await db
          .select({ id: cryovialTube.id })
          .from(cryovialTube)
          .leftJoin(cryovialBox, eq(cryovialTube.manifestId, cryovialBox.id))
          .leftJoin(location, eq(cryovialBox.locationId, location.id))
          .where(
            and(
              ...locationConditions,
              sql`${cryovialTube.id} IS NOT NULL`,
              sql`${cryovialBox.id} IS NOT NULL`,
              sql`${location.id} IS NOT NULL`,
            ) as any
          )
        
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

            if (stateId) {
              const id = parseInt(stateId)
              if (!isNaN(id)) {
                containerConditions.push(eq(storageContainer.stateId, id))
              }
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

        if (stateId) {
          const id = parseInt(stateId)
          if (!isNaN(id)) {
            containerConditions.push(eq(storageContainer.stateId, id))
          }
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
    if (containerType || stateId || hasLocationFilter) {
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

    // Containers by state
    const stateIds = [...new Set(finalContainers.map(c => c.stateId))]
    const states = stateIds.length > 0
      ? await db.select().from(state).where(inArray(state.id, stateIds))
      : []
    const stateMap = new Map(states.map(s => [s.id, s.name]))
    
    const byState: Record<string, number> = {}
    finalContainers.forEach(c => {
      const stateName = stateMap.get(c.stateId) || 'Unknown'
      byState[stateName] = (byState[stateName] || 0) + 1
    })

    // Containers by status (Inferred from remaining quantity)
    const byStatus: Record<string, number> = {}
    finalContainers.forEach(c => {
      const statusName = (c.remainingQuantity ?? 0) > 0 ? 'In Use' : 'Exhausted'
      byStatus[statusName] = (byStatus[statusName] || 0) + 1
    })

    // Storage Statistics
    // Get location IDs from containers via micronix/cryovial plates/boxes
    const finalContainerIds = finalContainers.map(c => c.id)
    
    let micronixTubes: Array<{ containerId: number; locationId: number | null }> = []
    let cryovialTubes: Array<{ containerId: number; locationId: number | null }> = []
    
    if (finalContainerIds.length > 0) {
      // Batch queries to avoid SQLite variable limit
      const containerChunks = chunkArray(finalContainerIds, 500)
      
      for (const chunk of containerChunks) {
        const [micronixBatch, cryovialBatch] = await Promise.all([
          db.select({ containerId: micronixTube.id, locationId: micronixPlate.locationId })
            .from(micronixTube)
            .leftJoin(micronixPlate, eq(micronixTube.manifestId, micronixPlate.id))
            .where(inArray(micronixTube.id, chunk)),
          db.select({ containerId: cryovialTube.id, locationId: cryovialBox.locationId })
            .from(cryovialTube)
            .leftJoin(cryovialBox, eq(cryovialTube.manifestId, cryovialBox.id))
            .where(inArray(cryovialTube.id, chunk)),
        ])
        micronixTubes.push(...micronixBatch)
        cryovialTubes.push(...cryovialBatch)
      }
    }

    const locationIds = [
      ...micronixTubes.map(t => t.locationId).filter((id): id is number => id !== null),
      ...cryovialTubes.map(t => t.locationId).filter((id): id is number => id !== null),
    ]

    const byLocation: { location: string; count: number }[] = []
    const byLocationRoot: Record<string, number> = {}

    if (locationIds.length > 0) {
      // Batch query to avoid SQLite variable limit
      const locationChunks = chunkArray(locationIds, 500)
      const allLocations: Array<typeof location.$inferSelect> = []
      
      for (const chunk of locationChunks) {
        const locations = await db
          .select()
          .from(location)
          .where(inArray(location.id, chunk))
        allLocations.push(...locations)
      }
      
      const locations = allLocations

      const locationMap = new Map(locations.map(l => [l.id, l]))

      // Count by location
      const locationCountMap = new Map<string, number>()
      locationIds.forEach(id => {
        const loc = locationMap.get(id)
        if (loc) {
          const path = [loc.locationRoot, loc.levelI, loc.levelII, loc.levelIII]
            .filter(Boolean)
            .join(' → ')
          locationCountMap.set(path, (locationCountMap.get(path) || 0) + 1)
        }
      })

      Array.from(locationCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20) // Top 20 locations
        .forEach(([location, count]) => {
          byLocation.push({ location, count })
        })

      // Count by location root
      locationIds.forEach(id => {
        const loc = locationMap.get(id)
        if (loc) {
          byLocationRoot[loc.locationRoot] = (byLocationRoot[loc.locationRoot] || 0) + 1
        }
      })
    }

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
        byState,
        byStatus,
        averagePerSpecimen: Math.round(averagePerSpecimen * 100) / 100,
      },
      storage: {
        byLocation,
        byLocationRoot,
      },
    })
  } catch (error: any) {
    console.error('Error fetching statistics:', error)
    return c.json({ error: 'Failed to fetch statistics', details: error.message }, 500)
  }
})

export default statistics

