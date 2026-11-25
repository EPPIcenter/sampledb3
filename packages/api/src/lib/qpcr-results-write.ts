import { eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { qpcrAmplificationData, qpcrExperiment, qpcrRun, qpcrWellResult } from '../db/schema'
import { withWriteTransaction } from '../db/write-transaction'
import type { QpcrParseResult } from './qpcr-result-parse'
import { chunkArray, rowsPerInsert } from './sql-helpers'
import { utcNow } from './datetime'

/** Values each row binds: well results bind 9 (run, well, target, barcode, task, cq, quantities, status), amplification rows 4. */
const WELL_RESULT_PARAMETERS = 9
const AMPLIFICATION_PARAMETERS = 4

/** Well results and amplification rows join on well position and target, with '' for a missing target. */
function wellTargetKey(wellPosition: string, targetName: string | null): string {
  return `${wellPosition}\t${targetName ?? ''}`
}

/** What an upload stored, and the amplification rows it left out. */
export interface RecordedQpcrResults {
  run: typeof qpcrRun.$inferSelect
  wellResultCount: number
  amplificationCount: number
  /**
   * Amplification rows whose well and target have no row in the results section. QuantStudio
   * exports a curve for all 96 wells but a result only for wells set up with a sample, so these
   * are empty wells; the upload leaves them out and reports them instead.
   */
  skippedAmplification: { rowCount: number; wellPositions: string[] }
}

/**
 * Record a parsed qPCR result file against an experiment: the run, its well results, their
 * amplification data, and the experiment's `results_uploaded` status. All of it commits in one
 * transaction, so a failure partway leaves no run or well result behind and a retry starts clean.
 * Amplification rows with no matching well result are not stored; the result counts them.
 */
export async function recordQpcrResults(
  database: Database,
  input: {
    experimentId: number
    instrumentType: string
    parseResult: QpcrParseResult
    userId: number | null
  },
): Promise<RecordedQpcrResults> {
  const { experimentId, instrumentType, parseResult, userId } = input
  const now = utcNow()

  // A later row for the same well and target replaces an earlier one, as the unique index requires.
  const deduped = new Map<string, QpcrParseResult['wellResults'][number]>()
  for (const row of parseResult.wellResults) {
    deduped.set(wellTargetKey(row.wellPosition, row.targetName), row)
  }

  return withWriteTransaction(database, async (tx) => {
    const [runRow] = await tx
      .insert(qpcrRun)
      .values({
        qpcrExperimentId: experimentId,
        instrumentType,
        runStartedAt: parseResult.runMetadata.runStartedAt,
        runEndedAt: parseResult.runMetadata.runEndedAt,
        experimentName: parseResult.runMetadata.experimentName,
        fileName: parseResult.runMetadata.fileName,
        created: now,
        slope: parseResult.runMetadata.slope ?? null,
        yIntercept: parseResult.runMetadata.yIntercept ?? null,
        rSquared: parseResult.runMetadata.rSquared ?? null,
        efficiency: parseResult.runMetadata.efficiency ?? null,
      })
      .returning()

    const wellResultIds = new Map<string, number>()
    const wellResultRows = [...deduped.values()].map((row) => ({
      qpcrRunId: runRow.id,
      wellPosition: row.wellPosition,
      targetName: row.targetName,
      sampleBarcode: row.sampleBarcode,
      task: row.task,
      cq: row.cq,
      quantity: row.quantity,
      standardQuantity: row.standardQuantity,
      ampStatus: row.ampStatus,
    }))
    for (const chunk of chunkArray(wellResultRows, rowsPerInsert(WELL_RESULT_PARAMETERS))) {
      const inserted = await tx
        .insert(qpcrWellResult)
        .values(chunk)
        .returning({
          id: qpcrWellResult.id,
          wellPosition: qpcrWellResult.wellPosition,
          targetName: qpcrWellResult.targetName,
        })
      for (const row of inserted) {
        wellResultIds.set(wellTargetKey(row.wellPosition, row.targetName), row.id)
      }
    }

    const ampRows: Array<typeof qpcrAmplificationData.$inferInsert> = []
    let skippedRowCount = 0
    const skippedWells = new Set<string>()
    for (const row of parseResult.amplificationData) {
      const wellResultId = wellResultIds.get(wellTargetKey(row.wellPosition, row.targetName))
      if (wellResultId == null) {
        skippedRowCount++
        skippedWells.add(row.wellPosition)
        continue
      }
      ampRows.push({
        qpcrWellResultId: wellResultId,
        cycle: row.cycle,
        rn: row.rn ?? null,
        deltaRn: row.deltaRn ?? null,
      })
    }
    for (const chunk of chunkArray(ampRows, rowsPerInsert(AMPLIFICATION_PARAMETERS))) {
      await tx.insert(qpcrAmplificationData).values(chunk)
    }

    await tx
      .update(qpcrExperiment)
      .set({ status: 'results_uploaded', lastUpdated: now, updatedBy: userId })
      .where(eq(qpcrExperiment.id, experimentId))

    return {
      run: runRow,
      wellResultCount: wellResultRows.length,
      amplificationCount: ampRows.length,
      skippedAmplification: { rowCount: skippedRowCount, wellPositions: [...skippedWells] },
    }
  })
}
