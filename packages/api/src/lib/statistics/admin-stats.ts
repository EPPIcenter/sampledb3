import type { Database } from '../../db/client'
import {
  specimen,
  storageContainer,
  studySubject,
  study,
  specimenType,
  tag,
  location,
  micronixTube,
  micronixPlate,
  cryovialTube,
  cryovialBox,
  paper,
  staticWell,
  users,
  sessions,
  storageType,
  strain,
  unit,
  box,
  bag,
} from '../../db/schema'
import { and, sql, isNull, gt } from 'drizzle-orm'
import type { AdminStatistics } from './types'

/** Admin dashboard entity and reference-data counts. */
export async function getAdminStatistics(database: Database): Promise<AdminStatistics> {
  const [totalUsers, activeUsers, deletedUsers, usersByRole] = await Promise.all([
    database.select({ count: sql<number>`count(*)` }).from(users),
    database.select({ count: sql<number>`count(*)` }).from(users).where(isNull(users.deletedAt)),
    database.select({ count: sql<number>`count(*)` }).from(users).where(sql`${users.deletedAt} IS NOT NULL`),
    database
      .select({
        role: users.role,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.role),
  ])

  const now = Math.floor(Date.now() / 1000)
  const activeSessions = await database
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(gt(sessions.expiresAt, now))

  const [studiesCount, subjectsCount, specimensCount, containersCount] = await Promise.all([
    database.select({ count: sql<number>`count(*)` }).from(study),
    database.select({ count: sql<number>`count(*)` }).from(studySubject),
    database.select({ count: sql<number>`count(*)` }).from(specimen),
    database.select({ count: sql<number>`count(*)` }).from(storageContainer),
  ])

  const [specimenTypesCount, storageTypesCount, tagsCount, unitsCount, strainsCount] = await Promise.all([
    database.select({ count: sql<number>`count(*)` }).from(specimenType),
    database.select({ count: sql<number>`count(*)` }).from(storageType),
    database.select({ count: sql<number>`count(*)` }).from(tag),
    database.select({ count: sql<number>`count(*)` }).from(unit),
    database.select({ count: sql<number>`count(*)` }).from(strain),
  ])

  const [micronixCount, cryovialCount, paperCount, staticWellCount] = await Promise.all([
    database.select({ count: sql<number>`count(*)` }).from(micronixTube),
    database.select({ count: sql<number>`count(*)` }).from(cryovialTube),
    database.select({ count: sql<number>`count(*)` }).from(paper),
    database.select({ count: sql<number>`count(*)` }).from(staticWell),
  ])

  const [micronixPlatesCount, cryovialBoxesCount, boxesCount, bagsCount] = await Promise.all([
    database.select({ count: sql<number>`count(*)` }).from(micronixPlate),
    database.select({ count: sql<number>`count(*)` }).from(cryovialBox),
    database.select({ count: sql<number>`count(*)` }).from(box),
    database.select({ count: sql<number>`count(*)` }).from(bag),
  ])

  const locationsCount = await database.select({ count: sql<number>`count(*)` }).from(location)

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const recentLogins = await database
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(isNull(users.deletedAt), sql`${users.lastLogin} >= ${sevenDaysAgo.toISOString()}`))

  const usersByRoleMap: Record<string, number> = {}
  usersByRole.forEach((row: { role: string; count: number }) => {
    usersByRoleMap[row.role] = row.count
  })

  return {
    users: {
      total: totalUsers[0]?.count || 0,
      active: activeUsers[0]?.count || 0,
      deleted: deletedUsers[0]?.count || 0,
      byRole: usersByRoleMap,
      recentLogins: recentLogins[0]?.count || 0,
    },
    sessions: {
      active: activeSessions[0]?.count || 0,
    },
    entities: {
      studies: studiesCount[0]?.count || 0,
      subjects: subjectsCount[0]?.count || 0,
      specimens: specimensCount[0]?.count || 0,
      containers: containersCount[0]?.count || 0,
    },
    containers: {
      micronixTubes: micronixCount[0]?.count || 0,
      cryovialTubes: cryovialCount[0]?.count || 0,
      papers: paperCount[0]?.count || 0,
      staticWells: staticWellCount[0]?.count || 0,
    },
    collections: {
      micronixPlates: micronixPlatesCount[0]?.count || 0,
      cryovialBoxes: cryovialBoxesCount[0]?.count || 0,
      boxes: boxesCount[0]?.count || 0,
      bags: bagsCount[0]?.count || 0,
    },
    referenceData: {
      specimenTypes: specimenTypesCount[0]?.count || 0,
      storageTypes: storageTypesCount[0]?.count || 0,
      tags: tagsCount[0]?.count || 0,
      units: unitsCount[0]?.count || 0,
      strains: strainsCount[0]?.count || 0,
    },
    locations: {
      total: locationsCount[0]?.count || 0,
    },
  }
}
