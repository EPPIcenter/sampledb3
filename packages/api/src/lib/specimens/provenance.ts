import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { specimen, studySubject, study, controlBatch, controlDefinition, unit, strain } from '../../db/schema'
import { parseControlProperties } from '../control-properties'

/**
 * Where a Specimen's material originated — the Source in domain terms.
 *
 * A discriminated union on `type`:
 * - `subject`: the Study → Subject provenance chain.
 * - `control`: the Composition → Control definition → Control batch chain.
 *
 * The shape is the superset of every field current callers read, so any
 * consumer can pick the fields it needs and ignore the rest. Derivation
 * provenance (parent → child containers) is a separate concept and is not
 * modelled here.
 */
export type SubjectSource = {
  type: 'subject'
  id: number
  name: string
  study: {
    id: number
    title: string
    code: string
    leadPerson: string
  }
}

export type ControlSource = {
  type: 'control'
  id: number
  name: string
  productionDate: string | null
  controlType: string
  definitionName: string | null
  definition: { id: number; name: string } | null
  targetDensity: number | null
  targetDensityUnit: string | null
  strainComposition: string | null
}

export type SpecimenSource = SubjectSource | ControlSource

type SpecimenProvenanceRow = {
  id: number
  studySubjectId: number | null
  controlBatchId: number | null
}

/** Resolve the Source for one specimen, or `null` when none can be resolved. */
export async function resolveSpecimenSource(
  database: Database,
  specimenId: number,
): Promise<SpecimenSource | null> {
  const map = await resolveSpecimenSources(database, [specimenId])
  return map.get(specimenId) ?? null
}

/**
 * Resolve the Source for many specimens in a fixed number of queries.
 *
 * Loads subjects/studies, control batches/definitions, units, and strains in
 * batched lookups — no per-specimen or per-container round trips.
 */
export async function resolveSpecimenSources(
  database: Database,
  specimenIds: number[],
): Promise<Map<number, SpecimenSource | null>> {
  const result = new Map<number, SpecimenSource | null>()
  if (specimenIds.length === 0) return result

  const uniqueIds = [...new Set(specimenIds)]
  const specimens = (await database
    .select({
      id: specimen.id,
      studySubjectId: specimen.studySubjectId,
      controlBatchId: specimen.controlBatchId,
    })
    .from(specimen)
    .where(inArray(specimen.id, uniqueIds))) as SpecimenProvenanceRow[]

  const subjectMap = await loadSubjectSources(database, specimens)
  const controlMap = await loadControlSources(database, specimens)

  for (const spec of specimens) {
    if (spec.studySubjectId != null) {
      result.set(spec.id, subjectMap.get(spec.studySubjectId) ?? null)
    } else if (spec.controlBatchId != null) {
      result.set(spec.id, controlMap.get(spec.controlBatchId) ?? null)
    } else {
      result.set(spec.id, null)
    }
  }

  return result
}

async function loadSubjectSources(
  database: Database,
  specimens: SpecimenProvenanceRow[],
): Promise<Map<number, SubjectSource>> {
  const subjectIds = [...new Set(specimens.filter((s) => s.studySubjectId != null).map((s) => s.studySubjectId!))]
  const sources = new Map<number, SubjectSource>()
  if (subjectIds.length === 0) return sources

  const rows = await database
    .select({
      id: studySubject.id,
      name: studySubject.name,
      studyId: studySubject.studyId,
      studyTitle: study.title,
      studyCode: study.shortCode,
      studyLeadPerson: study.leadPerson,
    })
    .from(studySubject)
    .leftJoin(study, eq(studySubject.studyId, study.id))
    .where(inArray(studySubject.id, subjectIds))

  for (const row of rows) {
    if (row.studyTitle == null || row.studyCode == null) continue
    sources.set(row.id, {
      type: 'subject',
      id: row.id,
      name: row.name,
      study: {
        id: row.studyId,
        title: row.studyTitle,
        code: row.studyCode,
        leadPerson: row.studyLeadPerson ?? '',
      },
    })
  }

  return sources
}

async function loadControlSources(
  database: Database,
  specimens: SpecimenProvenanceRow[],
): Promise<Map<number, ControlSource>> {
  const batchIds = [...new Set(specimens.filter((s) => s.controlBatchId != null).map((s) => s.controlBatchId!))]
  const sources = new Map<number, ControlSource>()
  if (batchIds.length === 0) return sources

  const batches = await database
    .select({
      id: controlBatch.id,
      name: controlBatch.name,
      productionDate: controlBatch.productionDate,
      definitionId: controlDefinition.id,
      definitionName: controlDefinition.name,
      controlType: controlDefinition.controlType,
      definitionProperties: controlDefinition.properties,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .where(inArray(controlBatch.id, batchIds))

  const strainRows = await database.select().from(strain)
  const strainMap = new Map(strainRows.map((s) => [s.id, { name: s.name }]))

  const parsedByBatch = batches.map((batch) => ({
    batch,
    parsed: parseControlProperties(batch.definitionProperties, strainMap),
  }))

  const pendingUnitIds = [
    ...new Set(
      parsedByBatch
        .filter(({ parsed }) => parsed.targetDensityUnitId != null && parsed.unitSymbol == null)
        .map(({ parsed }) => parsed.targetDensityUnitId!),
    ),
  ]
  const unitSymbolById = new Map<number, string>()
  if (pendingUnitIds.length > 0) {
    const units = await database
      .select({ id: unit.id, symbol: unit.symbol })
      .from(unit)
      .where(inArray(unit.id, pendingUnitIds))
    for (const u of units) unitSymbolById.set(u.id, u.symbol)
  }

  for (const { batch, parsed } of parsedByBatch) {
    const targetDensityUnit =
      parsed.unitSymbol ??
      (parsed.targetDensityUnitId != null ? unitSymbolById.get(parsed.targetDensityUnitId) ?? null : null)

    const strainComposition =
      parsed.strains.length > 0
        ? parsed.strains.map((s) => `${s.name} (${s.percentage ?? 0}%)`).join('; ')
        : null

    sources.set(batch.id, {
      type: 'control',
      id: batch.id,
      name: batch.name,
      productionDate: batch.productionDate ?? null,
      controlType: batch.controlType ?? '',
      definitionName: batch.definitionName ?? null,
      definition: batch.definitionId != null ? { id: batch.definitionId, name: batch.definitionName ?? '' } : null,
      targetDensity: parsed.targetDensity ?? null,
      targetDensityUnit,
      strainComposition,
    })
  }

  return sources
}
