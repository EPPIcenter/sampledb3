import type { Database } from '../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
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
  box,
  bag,
  sheet,
} from '../../db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { cache, cacheKeys } from '../cache'
import { resolveContainerTypes } from '../container-placement'
import { buildDateFilter, chunkArray } from './helpers'
import type { DashboardStatistics, StatisticsFilters } from './types'

/** Filtered dashboard statistics for specimens, containers, and storage. */
export async function getDashboardStatistics(
  database: Database,
  sqliteDatabase: SQLiteDatabase,
  filters: StatisticsFilters,
): Promise<DashboardStatistics> {
    const {
      study: studyCode,
      source_type: sourceType,
      specimen_type_id: specimenTypeId,
      container_type: containerType,
      tag_ids: tagIds,
      location_id: locationId,
      collection_date_from: collectionDateFrom,
      collection_date_to: collectionDateTo,
      created_from: createdFrom,
      created_to: createdTo,
    } = filters

    // Build specimen filter conditions
    const specimenConditions = []
    
    // Filter by study
    let subjectIds: number[] = []
    if (studyCode) {
      const studyRecord = await database
        .select()
        .from(study)
        .where(eq(study.shortCode, studyCode))
        .get()
      
      if (studyRecord) {
        const subjects = await database
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
          return {
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
          }
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
    let specimenQuery = database.select().from(specimen)
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
    // Use cache for specimen types (reference data that changes infrequently)
    const specimenTypeIds = [...new Set(filteredSpecimens.map(s => s.specimenTypeId))]
    let specimenTypes = specimenTypeIds.length > 0
      ? cache.get<typeof specimenType.$inferSelect[]>(cacheKeys.specimenTypes)
      : null
    
    if (!specimenTypes && specimenTypeIds.length > 0) {
      specimenTypes = await database.select().from(specimenType).where(inArray(specimenType.id, specimenTypeIds))
      // Cache all specimen types (not just filtered ones) for future use
      const allSpecimenTypes = await database.select().from(specimenType)
      cache.set(cacheKeys.specimenTypes, allSpecimenTypes, 10 * 60 * 1000) // 10 minutes
      // Use filtered types for this query
      specimenTypes = allSpecimenTypes.filter(st => specimenTypeIds.includes(st.id))
    } else if (specimenTypeIds.length > 0 && specimenTypes) {
      // Filter cached types to only those we need
      specimenTypes = specimenTypes.filter(st => specimenTypeIds.includes(st.id))
    } else {
      specimenTypes = []
    }
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
          const subjects = await database
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
          const studies = await database
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
      const id = parseInt(locationId!)
      if (!isNaN(id)) {
        // Get the location and all its descendants
        const targetLocation = await database
          .select()
          .from(location)
          .where(eq(location.id, id))
          .get()
        
        if (targetLocation) {
          // Get all descendants of this location
          const { getLocationDescendants } = await import('../location-helpers')
          const descendants = await getLocationDescendants(sqliteDatabase, id)
          filteredLocationIds = [id, ...descendants.map(d => d.id)]
        } else {
          // Location not found, return empty results
          return {
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
          }
        }
      }
    }

    // Get container IDs filtered by tags if tag filter is provided
    // Using AND logic: containers must have ALL selected tags
    let tagFilteredContainerIds: number[] | null = null
    if (tagIds && tagIds.length > 0) {
      
      // For AND logic, find containers that have all selected tags
      // Query containers for each tag and find the intersection
      const containerSets: Set<number>[] = []
      
      for (const tagId of tagIds) {
        const containersWithTag = await database
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

      if (tagFilteredContainerIds.length === 0) {
        // No containers match all the tags, return empty results
        return {
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
        }
      }
    }

    // Container Statistics
    // Use efficient joins when location filter is present
    let filteredContainers: Array<typeof storageContainer.$inferSelect> = []

    if (specimenIds.length > 0) {
      // Get location-filtered container IDs once (if location filter is active)
      let locationFilteredContainerIds: number[] | null = null
      if (hasLocationFilter && filteredLocationIds.length > 0) {
        // Query container IDs by matching location IDs (avoiding circular references)
        // First, get plates/boxes that match the location IDs
        const [matchingPlates, matchingBoxes] = await Promise.all([
          database.select({ id: micronixPlate.id })
            .from(micronixPlate)
            .where(inArray(micronixPlate.locationId, filteredLocationIds)),
          database.select({ id: cryovialBox.id })
            .from(cryovialBox)
            .where(inArray(cryovialBox.locationId, filteredLocationIds)),
        ])
        
        const plateIds = matchingPlates.map(p => p.id)
        const boxIds = matchingBoxes.map(b => b.id)
        
        // Then get container IDs from those plates/boxes
        const [micronixContainerIds, cryovialContainerIds] = await Promise.all([
          plateIds.length > 0
            ? database.select({ id: micronixTube.id })
                .from(micronixTube)
                .where(inArray(micronixTube.collectionId, plateIds))
            : Promise.resolve([]),
          boxIds.length > 0
            ? database.select({ id: cryovialTube.id })
                .from(cryovialTube)
                .where(inArray(cryovialTube.collectionId, boxIds))
            : Promise.resolve([]),
        ])

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
      }
      
      // Batch query if too many specimen IDs to avoid SQLite variable limit
      // Use Promise.all to parallelize queries for better performance
      const specimenChunks = chunkArray(specimenIds, 500)
      
      const chunkResults = await Promise.all(
        specimenChunks.map(async (specimenChunk, chunkIndex) => {
          let containerQuery = database.select().from(storageContainer)
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
      return {
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
      }
    } else {
      // No specimen filter, but we might have state/status/location filters
      if (hasLocationFilter && filteredLocationIds.length > 0) {
        // Query container IDs by matching location IDs (avoiding circular references)
        // First, get plates/boxes that match the location IDs
        const [matchingPlates, matchingBoxes] = await Promise.all([
          database.select({ id: micronixPlate.id })
            .from(micronixPlate)
            .where(inArray(micronixPlate.locationId, filteredLocationIds)),
          database.select({ id: cryovialBox.id })
            .from(cryovialBox)
            .where(inArray(cryovialBox.locationId, filteredLocationIds)),
        ])
        
        const plateIds = matchingPlates.map(p => p.id)
        const boxIds = matchingBoxes.map(b => b.id)
        
        // Then get container IDs from those plates/boxes
        const [micronixContainerIds, cryovialContainerIds] = await Promise.all([
          plateIds.length > 0
            ? database.select({ id: micronixTube.id })
                .from(micronixTube)
                .where(inArray(micronixTube.collectionId, plateIds))
            : Promise.resolve([]),
          boxIds.length > 0
            ? database.select({ id: cryovialTube.id })
                .from(cryovialTube)
                .where(inArray(cryovialTube.collectionId, boxIds))
            : Promise.resolve([]),
        ])
        
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
          // Use Promise.all to parallelize queries
          const containerIdChunks = chunkArray(locationFilteredContainerIds, 500)
          const chunkResults = await Promise.all(
            containerIdChunks.map(async (containerIdChunk) => {
              let containerQuery = database.select().from(storageContainer)
              const containerConditions = [inArray(storageContainer.id, containerIdChunk)]

              // Apply tag filter if provided
              if (tagFilteredContainerIds) {
                containerConditions.push(inArray(storageContainer.id, tagFilteredContainerIds))
              }

              containerQuery = containerQuery.where(and(...containerConditions) as any) as any
              return await containerQuery
            })
          )
          filteredContainers = chunkResults.flat()
        }
      } else {
        // No location filter
        let containerQuery = database.select().from(storageContainer)
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
    const containerTypeMap = await resolveContainerTypes(database, containerIds)

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
        ? await database.select().from(specimenType).where(inArray(specimenType.id, adjustedSpecimenTypeIds))
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
          const subjects = await database
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
          const studies = await database
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
    let containerTags: Array<{ containerId: number; tagId: number; tagName: string }> = []
    
    if (finalContainerIds.length > 0) {
      // Batch query to avoid SQLite variable limit and stack overflow
      const containerIdChunks = chunkArray(finalContainerIds, 500)

      // Use Promise.all to parallelize container tag queries
      const tagChunkResults = await Promise.all(
        containerIdChunks.map(async (chunk, i) => {
          const chunkTags = await database
            .select({
              containerId: storageContainerTag.storageContainerId,
              tagId: tag.id,
              tagName: tag.name,
            })
            .from(storageContainerTag)
            .innerJoin(tag, eq(storageContainerTag.tagId, tag.id))
            .where(inArray(storageContainerTag.storageContainerId, chunk))
          return chunkTags
        })
      )
      containerTags = tagChunkResults.flat()
    }

    const byTags: Record<string, number> = {}
    containerTags.forEach(ct => {
      byTags[ct.tagName] = (byTags[ct.tagName] || 0) + 1
    })

    // Containers by status (Inferred from remaining quantity)
    const byStatus: Record<string, number> = {}
    finalContainers.forEach(c => {
      let statusName: string
      if (c.remainingQuantity == null) {
        statusName = 'Unknown'
      } else if (c.remainingQuantity > 0) {
        statusName = 'In Use'
      } else {
        statusName = 'Exhausted'
      }
      byStatus[statusName] = (byStatus[statusName] || 0) + 1
    })

    // Storage Statistics
    // Get location IDs from containers via micronix/cryovial plates/boxes, paper via sheets/boxes/bags, and static wells
    // Reuse finalContainerIds from above (line 673)
    
    let micronixTubes: Array<{ containerId: number; locationId: number | null }> = []
    let cryovialTubes: Array<{ containerId: number; locationId: number | null }> = []
    let paperContainers: Array<{ containerId: number; locationId: number | null }> = []
    let staticWells: Array<{ containerId: number; locationId: number | null }> = []
    
    if (finalContainerIds.length > 0) {
      // Batch queries to avoid SQLite variable limit
      // Use Promise.all to parallelize all chunks
      const containerChunks = chunkArray(finalContainerIds, 500)

      const storageChunkResults = await Promise.all(
        containerChunks.map(async (chunk, i) => {
          const [micronixBatch, cryovialBatch, paperBoxBatch, paperBagBatch, staticWellBatch] = await Promise.all([
            database.select({ containerId: micronixTube.id, locationId: micronixPlate.locationId })
              .from(micronixTube)
              .leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
              .where(inArray(micronixTube.id, chunk)),
            database.select({ containerId: cryovialTube.id, locationId: cryovialBox.locationId })
              .from(cryovialTube)
              .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
              .where(inArray(cryovialTube.id, chunk)),
            // Paper containers in boxes: paper -> sheet -> box -> location
            database.select({ containerId: paper.id, locationId: box.locationId })
              .from(paper)
              .leftJoin(sheet, eq(paper.sheetId, sheet.id))
              .leftJoin(box, eq(sheet.boxId, box.id))
              .where(inArray(paper.id, chunk)),
            // Paper containers in bags: paper -> sheet -> bag -> location
            database.select({ containerId: paper.id, locationId: bag.locationId })
              .from(paper)
              .leftJoin(sheet, eq(paper.sheetId, sheet.id))
              .leftJoin(bag, eq(sheet.bagId, bag.id))
              .where(inArray(paper.id, chunk)),
            // Static wells: static_well -> micronix_plate -> location
            database.select({ containerId: staticWell.id, locationId: micronixPlate.locationId })
              .from(staticWell)
              .leftJoin(micronixPlate, eq(staticWell.collectionId, micronixPlate.id))
              .where(inArray(staticWell.id, chunk)),
          ])
          
          // Combine paper results (box and bag), preferring box location if both exist
          const paperMap = new Map<number, number | null>()
          paperBoxBatch.forEach(p => {
            if (p.locationId !== null) {
              paperMap.set(p.containerId, p.locationId)
            }
          })
          paperBagBatch.forEach(p => {
            // Only set if not already set from box (box takes precedence)
            if (!paperMap.has(p.containerId) && p.locationId !== null) {
              paperMap.set(p.containerId, p.locationId)
            }
          })
          const paperBatch = Array.from(paperMap.entries()).map(([containerId, locationId]) => ({
            containerId,
            locationId,
          }))
          return { micronix: micronixBatch, cryovial: cryovialBatch, paper: paperBatch, staticWell: staticWellBatch }
        })
      )
      
      // Flatten results
      storageChunkResults.forEach(result => {
        micronixTubes.push(...result.micronix)
        cryovialTubes.push(...result.cryovial)
        paperContainers.push(...result.paper)
        staticWells.push(...result.staticWell)
      })
    }

    // Count containers with locations for verification
    const containersWithLocations = micronixTubes.filter(t => t.locationId !== null).length +
      cryovialTubes.filter(t => t.locationId !== null).length +
      paperContainers.filter(t => t.locationId !== null).length +
      staticWells.filter(t => t.locationId !== null).length

    const locationIds = [
      ...micronixTubes.map(t => t.locationId).filter((id): id is number => id !== null),
      ...cryovialTubes.map(t => t.locationId).filter((id): id is number => id !== null),
      ...paperContainers.map(t => t.locationId).filter((id): id is number => id !== null),
      ...staticWells.map(t => t.locationId).filter((id): id is number => id !== null),
    ]

    const byLocation: { location: string; count: number }[] = []
    const byRootLocation: Record<string, number> = {}

    if (locationIds.length > 0) {
      // Batch query to avoid SQLite variable limit
      // Use Promise.all to parallelize location queries
      const locationChunks = chunkArray(locationIds, 500)

      const locationChunkResults = await Promise.all(
        locationChunks.map(async (chunk, i) => {
          const locations = await database
            .select()
            .from(location)
            .where(inArray(location.id, chunk))
          return locations
        })
      )
      
      const locations = locationChunkResults.flat()

      const locationMap = new Map(locations.map(l => [l.id, l]))

      // Collect all parent IDs we need to query
      const parentIdsToLoad = new Set<number>()
      locations.forEach(loc => {
        let current: typeof location.$inferSelect | undefined = loc
        while (current.parentId != null) {
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
        const parentChunks = chunkArray(Array.from(parentIdsToLoad), 500)
        for (const chunk of parentChunks) {
          const parentLocations = await database
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
            const parentLocations = await database
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
        while (current.parentId != null) {
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
      let countedByRoot = 0
      locationIds.forEach(id => {
        const loc = locationMap.get(id)
        if (loc) {
          const rootLoc = getRootLocation(loc)
          const rootName = rootLoc.name || `Location ${rootLoc.id}`
          byRootLocation[rootName] = (byRootLocation[rootName] || 0) + 1
          countedByRoot++
        }
      })
    }

    // Calculate total containers with locations for verification
    const totalContainersWithLocations = Object.values(byRootLocation).reduce((sum, count) => sum + count, 0)
    const containersWithoutLocations = containerTotal - totalContainersWithLocations
    
    return {
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
        // Add summary for debugging/verification
        _summary: {
          totalContainers: containerTotal,
          containersWithLocations: totalContainersWithLocations,
          containersWithoutLocations: containersWithoutLocations,
        },
      },
    }
}
