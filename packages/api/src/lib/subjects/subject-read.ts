import type { Database } from '../../db/client'
import {
  studySubject,
  study,
  specimen,
  specimenType,
  storageContainer,
  unit,
  qpcrExperiment,
  qpcrExperimentWell,
  qpcrRun,
  qpcrWellResult,
} from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'
import {
  buildSpecimenSummaryData,
  emptySpecimenCollectionSummary,
  type SpecimenSummaryInput,
  type StorageContainerSummaryRow,
} from '../container-enrichment'
import { NotFoundError } from '../error-handler'

export type SubjectWithStudy = {
  id: number
  studyId: number
  name: string
  created: string
  lastUpdated: string
  study: {
    id: number
    title: string
    shortCode: string
  } | null
}

export type SubjectSummaryResult = {
  subject: SubjectWithStudy
  specimens: Awaited<ReturnType<typeof buildSpecimenSummaryData>>['enrichedSpecimens']
  summary: Awaited<ReturnType<typeof buildSpecimenSummaryData>>['summary']
}

export type SubjectQpcrResultRow = {
  experimentId: number
  experimentName: string | null
  runId: number
  runStartedAt: string | null
  fileName: string | null
  wellPosition: string
  targetName: string | null
  cq: number | null
  quantity: number | null
}

export type SubjectQpcrResultsResult = {
  results: SubjectQpcrResultRow[]
}

/** Load a study subject with its parent study. */
export async function getSubjectWithStudy(database: Database, subjectId: number): Promise<SubjectWithStudy> {
  const subject = await database
    .select({
      id: studySubject.id,
      studyId: studySubject.studyId,
      name: studySubject.name,
      created: studySubject.created,
      lastUpdated: studySubject.lastUpdated,
      study: {
        id: study.id,
        title: study.title,
        shortCode: study.shortCode,
      },
    })
    .from(studySubject)
    .leftJoin(study, eq(studySubject.studyId, study.id))
    .where(eq(studySubject.id, subjectId))
    .get()

  if (!subject) {
    throw new NotFoundError('Subject', subjectId)
  }

  return subject
}

/** Load enriched specimen summary for a study subject. */
export async function getSubjectSummary(database: Database, subjectId: number): Promise<SubjectSummaryResult> {
  const subject = await getSubjectWithStudy(database, subjectId)

  const specimens = await database
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
    .where(eq(specimen.studySubjectId, subjectId))

  if (specimens.length === 0) {
    return {
      subject,
      specimens: [],
      summary: emptySpecimenCollectionSummary(),
    }
  }

  const specimenIds = specimens.map((s) => s.id)
  const specimenTypeIds = [...new Set(specimens.map((s) => s.specimenTypeId))]
  const specimenTypes = await database
    .select()
    .from(specimenType)
    .where(inArray(specimenType.id, specimenTypeIds))
  const specimenTypeMap = new Map(specimenTypes.map((st) => [st.id, st.name]))

  const containers = await database
    .select({
      id: storageContainer.id,
      specimenId: storageContainer.specimenId,
      comment: storageContainer.comment,
      totalQuantity: storageContainer.totalQuantity,
      remainingQuantity: storageContainer.remainingQuantity,
      unitSymbol: unit.symbol,
    })
    .from(storageContainer)
    .leftJoin(unit, eq(storageContainer.unitId, unit.id))
    .where(inArray(storageContainer.specimenId, specimenIds))

  const { enrichedSpecimens, summary } = await buildSpecimenSummaryData(
    database,
    specimens as SpecimenSummaryInput[],
    containers as StorageContainerSummaryRow[],
    specimenTypeMap,
    { includeComment: true },
  )

  return { subject, specimens: enrichedSpecimens, summary }
}

/** Load qPCR well results linked to a study subject's specimens. */
export async function getSubjectQpcrResults(
  database: Database,
  subjectId: number,
): Promise<SubjectQpcrResultsResult> {
  await getSubjectWithStudy(database, subjectId)

  const specimens = await database
    .select({ id: specimen.id })
    .from(specimen)
    .where(eq(specimen.studySubjectId, subjectId))
  const specimenIds = specimens.map((s) => s.id)
  if (specimenIds.length === 0) {
    return { results: [] }
  }

  const wells = await database
    .select({
      qpcrExperimentId: qpcrExperimentWell.qpcrExperimentId,
      wellPosition: qpcrExperimentWell.wellPosition,
      specimenId: qpcrExperimentWell.specimenId,
    })
    .from(qpcrExperimentWell)
    .where(inArray(qpcrExperimentWell.specimenId, specimenIds))
  if (wells.length === 0) {
    return { results: [] }
  }

  const experimentIds = [...new Set(wells.map((w) => w.qpcrExperimentId))]
  const runs = await database
    .select({
      id: qpcrRun.id,
      qpcrExperimentId: qpcrRun.qpcrExperimentId,
      runStartedAt: qpcrRun.runStartedAt,
      fileName: qpcrRun.fileName,
    })
    .from(qpcrRun)
    .where(inArray(qpcrRun.qpcrExperimentId, experimentIds))
  const runIds = runs.map((r) => r.id)
  if (runIds.length === 0) {
    return { results: [] }
  }

  const wellResults = await database
    .select({
      id: qpcrWellResult.id,
      qpcrRunId: qpcrWellResult.qpcrRunId,
      wellPosition: qpcrWellResult.wellPosition,
      targetName: qpcrWellResult.targetName,
      cq: qpcrWellResult.cq,
      quantity: qpcrWellResult.quantity,
    })
    .from(qpcrWellResult)
    .where(inArray(qpcrWellResult.qpcrRunId, runIds))

  const runMap = new Map(runs.map((r) => [r.id, r]))
  const expMap = new Map<string, boolean>()
  wells.forEach((w) => expMap.set(`${w.qpcrExperimentId}\t${w.wellPosition}`, true))

  const experiments = await database
    .select({ id: qpcrExperiment.id, name: qpcrExperiment.name })
    .from(qpcrExperiment)
    .where(inArray(qpcrExperiment.id, experimentIds))
  const expNameMap = new Map(experiments.map((e) => [e.id, e.name]))

  const results = wellResults
    .filter((wr) => {
      const run = runMap.get(wr.qpcrRunId)
      return run && expMap.has(`${run.qpcrExperimentId}\t${wr.wellPosition}`)
    })
    .map((wr) => {
      const run = runMap.get(wr.qpcrRunId)!
      return {
        experimentId: run.qpcrExperimentId,
        experimentName: expNameMap.get(run.qpcrExperimentId) ?? null,
        runId: run.id,
        runStartedAt: run.runStartedAt,
        fileName: run.fileName,
        wellPosition: wr.wellPosition,
        targetName: wr.targetName,
        cq: wr.cq,
        quantity: wr.quantity,
      }
    })

  return { results }
}
