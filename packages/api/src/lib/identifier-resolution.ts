import { db } from '../db/client'
import { study, studySubject, specimenType, micronixTube, storageContainer, cryovialTube, paper } from '../db/schema'
import { eq, and, inArray } from 'drizzle-orm'

/**
 * Resolve study short code to study ID
 */
export async function resolveStudyByShortCode(shortCode: string): Promise<number | null> {
  const studyRecord = await db
    .select({ id: study.id })
    .from(study)
    .where(eq(study.shortCode, shortCode))
    .get()
  
  return studyRecord?.id ?? null
}

/**
 * Resolve subject name and study to subject ID
 */
export async function resolveSubjectByNameAndStudy(
  subjectName: string,
  studyId: number
): Promise<number | null> {
  const subjectRecord = await db
    .select({ id: studySubject.id })
    .from(studySubject)
    .where(and(
      eq(studySubject.studyId, studyId),
      eq(studySubject.name, subjectName)
    ) as any)
    .get()
  
  return subjectRecord?.id ?? null
}

/**
 * Resolve specimen type name to specimen type ID
 */
export async function resolveSpecimenTypeByName(name: string): Promise<number | null> {
  const specimenTypeRecord = await db
    .select({ id: specimenType.id })
    .from(specimenType)
    .where(eq(specimenType.name, name))
    .get()
  
  return specimenTypeRecord?.id ?? null
}

/**
 * Resolve container barcode to container ID
 */
export async function resolveContainerByBarcode(barcode: string): Promise<number | null> {
  // Try micronix tube
  const micronix = await db
    .select({ id: micronixTube.id })
    .from(micronixTube)
    .where(eq(micronixTube.barcode, barcode))
    .get()
  if (micronix) return micronix.id

  // Try cryovial tube
  const cryovial = await db
    .select({ id: cryovialTube.id })
    .from(cryovialTube)
    .where(eq(cryovialTube.barcode, barcode))
    .get()
  if (cryovial) return cryovial.id

  // Try paper
  const paperRec = await db
    .select({ id: paper.id })
    .from(paper)
    .where(eq(paper.barcode, barcode))
    .get()
  if (paperRec) return paperRec.id
  
  return null
}

/**
 * Batch resolve study short codes to study IDs
 */
export async function resolveStudiesByShortCodes(
  shortCodes: string[]
): Promise<Map<string, number>> {
  const uniqueCodes = [...new Set(shortCodes)]
  if (uniqueCodes.length === 0) return new Map()
  
  const result = new Map<string, number>()
  for (const code of uniqueCodes) {
    const id = await resolveStudyByShortCode(code)
    if (id) result.set(code, id)
  }
  
  return result
}

/**
 * Batch resolve specimen type names to IDs
 */
export async function resolveSpecimenTypesByNames(
  names: string[]
): Promise<Map<string, number>> {
  const uniqueNames = [...new Set(names)]
  if (uniqueNames.length === 0) return new Map()
  
  const result = new Map<string, number>()
  for (const name of uniqueNames) {
    const id = await resolveSpecimenTypeByName(name)
    if (id) result.set(name, id)
  }
  
  return result
}

/**
 * Batch resolve subject names and study IDs to subject IDs
 */
export async function resolveSubjectsByNameAndStudy(
  entries: Array<{ subjectName: string; studyId: number }>
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  for (const entry of entries) {
    const key = `${entry.studyId}:${entry.subjectName}`
    const subjectId = await resolveSubjectByNameAndStudy(entry.subjectName, entry.studyId)
    if (subjectId) {
      result.set(key, subjectId)
    }
  }
  
  return result
}

/**
 * Batch resolve subject names to IDs for a single study (optimized)
 */
export async function resolveSubjectNamesByStudy(
  subjectNames: string[],
  studyId: number
): Promise<Map<string, number>> {
  const uniqueNames = [...new Set(subjectNames)]
  if (uniqueNames.length === 0) return new Map()
  
  const subjects = await db
    .select({
      id: studySubject.id,
      name: studySubject.name,
    })
    .from(studySubject)
    .where(
      and(
        eq(studySubject.studyId, studyId),
        inArray(studySubject.name, uniqueNames)
      ) as any
    )
  
  const result = new Map<string, number>()
  for (const subject of subjects) {
    result.set(subject.name, subject.id)
  }
  
  return result
}

/**
 * Batch resolve subjects grouped by study
 * Returns a map of studyId -> Map<subjectName, subjectId>
 */
export async function resolveSubjectsByStudyGrouped(
  entries: Array<{ studyId: number; subjectName: string }>
): Promise<Map<number, Map<string, number>>> {
  const result = new Map<number, Map<string, number>>()
  
  // Group entries by study
  const byStudy = new Map<number, string[]>()
  for (const entry of entries) {
    if (!byStudy.has(entry.studyId)) {
      byStudy.set(entry.studyId, [])
    }
    byStudy.get(entry.studyId)!.push(entry.subjectName)
  }
  
  // Resolve subjects for each study
  for (const [studyId, subjectNames] of byStudy.entries()) {
    const subjectMap = await resolveSubjectNamesByStudy(subjectNames, studyId)
    result.set(studyId, subjectMap)
  }
  
  return result
}
