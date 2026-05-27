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
} from '../../db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { resolveContainerTypes } from '../container-placement'
import { buildDateFilter, chunkArray } from './helpers'
import { computeContainerAggregates } from './container-aggregates'
import {
  resolveContainerIdsAtLocations,
  resolveStatisticsLocationFilter,
} from './location-filter'
import { computeSpecimenAggregates } from './specimen-aggregates'
import { computeStorageStatistics } from './storage-aggregates'
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

    let specimenAggregates = await computeSpecimenAggregates(database, filteredSpecimens, {
      studyCode,
      subjectIds,
      useSpecimenTypeCache: true,
    })

    // Location Filtering - Query matching location IDs and their descendants
    const hasLocationFilter = !!locationId
    const locationFilter = await resolveStatisticsLocationFilter(database, sqliteDatabase, locationId)
    let filteredLocationIds: number[] = []

    if (locationFilter.kind === 'not_found') {
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

    if (locationFilter.kind === 'resolved') {
      filteredLocationIds = locationFilter.filteredLocationIds
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
        locationFilteredContainerIds = await resolveContainerIdsAtLocations(
          database,
          filteredLocationIds,
          tagFilteredContainerIds,
        )
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
          byTags: {},
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
        const locationFilteredContainerIds = await resolveContainerIdsAtLocations(
          database,
          filteredLocationIds,
          tagFilteredContainerIds,
        )

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
    const finalContainerIds = finalContainers.map((c) => c.id)

    if (containerType || tagFilteredContainerIds || hasLocationFilter) {
      const filteredSpecimenIds = [...new Set(finalContainers.map(c => c.specimenId))]
      const adjustedSpecimens =
        filteredSpecimenIds.length > 0
          ? filteredSpecimens.filter((s) => new Set(filteredSpecimenIds).has(s.id))
          : []

      specimenAggregates = await computeSpecimenAggregates(database, adjustedSpecimens, {
        studyCode,
        subjectIds,
        useSpecimenTypeCache: false,
      })
    }

    const averagePerSpecimen =
      specimenAggregates.total > 0 ? containerTotal / specimenAggregates.total : 0

    const containerAggregates = await computeContainerAggregates(
      database,
      finalContainers,
      containerTypeMap,
    )

    const storage = await computeStorageStatistics(database, finalContainerIds, containerTotal)

    return {
      specimens: specimenAggregates,
      containers: {
        total: containerTotal,
        ...containerAggregates,
        averagePerSpecimen: Math.round(averagePerSpecimen * 100) / 100,
      },
      storage,
    }
}
