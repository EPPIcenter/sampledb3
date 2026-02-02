/**
 * Parse qPCR result files (Biorad CSV, QuantStudio XLS) into normalized run metadata and well results.
 */

export interface QpcrRunMetadata {
  runStartedAt: string | null
  runEndedAt: string | null
  experimentName: string | null
  fileName: string | null
  slope?: number | null
  yIntercept?: number | null
  rSquared?: number | null
  efficiency?: number | null
}

export interface QpcrWellResultRow {
  wellPosition: string
  targetName: string | null
  sampleBarcode: string | null
  task: string
  cq: number | null
  quantity: number | null
  standardQuantity: number | null
  ampStatus: string | null
}

export interface QpcrAmplificationRow {
  wellPosition: string
  targetName: string | null
  cycle: number
  rn: number | null
  deltaRn: number | null
}

export interface QpcrParseResult {
  runMetadata: QpcrRunMetadata
  wellResults: QpcrWellResultRow[]
  amplificationData: QpcrAmplificationRow[]
}

/** Normalize well position to A01 style */
function normalizeWell(s: string): string {
  const t = s.trim()
  if (!t) return t
  const match = t.match(/^([A-Ha-h])(\d{1,2})$/)
  if (match) {
    return `${match[1].toUpperCase()}${parseInt(match[2], 10).toString().padStart(2, '0')}`
  }
  return t
}

function parseNum(v: string): number | null {
  if (v == null || v === '') return null
  const n = parseFloat(String(v).replace(/,/g, ''))
  if (Number.isNaN(n)) return null
  return n
}

/** Map Biorad Content (Std-1, Std-2, ... Neg Ctrl-6, Unkn) to task and standard_quantity */
function bioradContentToTask(content: string): { task: string; standardQuantity: number | null } {
  const c = (content || '').trim().toLowerCase()
  if (c.includes('neg') || c.includes('ctrl')) return { task: 'NTC', standardQuantity: null }
  if (c.includes('std-1') || c === 'std-1') return { task: 'STANDARD', standardQuantity: 10000 }
  if (c.includes('std-2') || c === 'std-2') return { task: 'STANDARD', standardQuantity: 1000 }
  if (c.includes('std-3') || c === 'std-3') return { task: 'STANDARD', standardQuantity: 100 }
  if (c.includes('std-4') || c === 'std-4') return { task: 'STANDARD', standardQuantity: 10 }
  if (c.includes('std-5') || c === 'std-5') return { task: 'STANDARD', standardQuantity: 1 }
  if (c.includes('unkn')) return { task: 'UNKNOWN', standardQuantity: null }
  return { task: 'UNKNOWN', standardQuantity: null }
}

/**
 * Parse Biorad CFX result CSV.
 * Expects metadata rows then a results table with Well, Content, Sample, Cq, Starting Quantity (SQ), etc.
 */
export function parseBioradCsv(text: string, fileName: string): QpcrParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  let runStartedAt: string | null = null
  let runEndedAt: string | null = null
  let experimentName: string | null = null
  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const line = lines[i]
    if (line.startsWith('Run Started,')) runStartedAt = line.split(',')[1]?.trim() ?? null
    if (line.startsWith('Run Ended,')) runEndedAt = line.split(',')[1]?.trim() ?? null
    if (line.startsWith('File Name,')) experimentName = line.split(',').slice(1).join(',').trim() || null
  }

  let resultsStart = -1
  let headerRow: string[] = []
  for (let i = 0; i < Math.min(80, lines.length); i++) {
    const row = lines[i].split(',').map((c) => c.trim())
    const rowLower = row.join(' ').toLowerCase()
    if (rowLower.includes('well') && (rowLower.includes('cq') || rowLower.includes('starting quantity'))) {
      resultsStart = i
      headerRow = row
      break
    }
  }

  const wellResults: QpcrWellResultRow[] = []
  if (resultsStart >= 0 && headerRow.length > 0) {
    const wellIdx = headerRow.findIndex((h) => /well/i.test(h))
    const contentIdx = headerRow.findIndex((h) => /content/i.test(h))
    const sampleIdx = headerRow.findIndex((h) => /sample/i.test(h))
    const cqIdx = headerRow.findIndex((h) => /^cq$/i.test(h))
    const sqIdx = headerRow.findIndex((h) => /starting quantity|sq/i.test(h))
    const targetIdx = headerRow.findIndex((h) => /target/i.test(h))

    for (let i = resultsStart + 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((c) => c.trim())
      if (values.length < 2) continue
      const wellRaw = wellIdx >= 0 ? values[wellIdx] ?? '' : values[0]
      const wellPosition = normalizeWell(wellRaw)
      if (!wellPosition) continue
      const content = contentIdx >= 0 ? values[contentIdx] ?? '' : ''
      const sampleBarcode = (sampleIdx >= 0 ? values[sampleIdx] ?? '' : '').trim() || null
      const { task, standardQuantity } = bioradContentToTask(content)
      let cq: number | null = null
      if (cqIdx >= 0) {
        const v = values[cqIdx]
        if (v && v.toLowerCase() !== 'nan' && v.toLowerCase() !== 'undetermined') cq = parseNum(v)
      }
      let quantity: number | null = null
      if (sqIdx >= 0) {
        const v = values[sqIdx]
        if (v && v.toLowerCase() !== 'nan') quantity = parseNum(v)
      }
      const targetName = targetIdx >= 0 ? (values[targetIdx] ?? '').trim() || null : null
      wellResults.push({
        wellPosition,
        targetName,
        sampleBarcode,
        task,
        cq,
        quantity,
        standardQuantity: task === 'STANDARD' ? (quantity ?? standardQuantity) : null,
        ampStatus: null,
      })
    }
  }

  return {
    runMetadata: {
      runStartedAt,
      runEndedAt,
      experimentName,
      fileName: fileName || null,
    },
    wellResults,
    amplificationData: [],
  }
}

/**
 * Parse QuantStudio result XLS: Results sheet for well results; optionally Amplification Data sheet.
 */
export async function parseQuantStudioXls(buffer: Buffer, fileName: string): Promise<QpcrParseResult> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  let runStartedAt: string | null = null
  let experimentName: string | null = null
  const wellResults: QpcrWellResultRow[] = []
  const amplificationData: QpcrAmplificationRow[] = []

  const resultsSheet = wb.SheetNames.find((n) => /results/i.test(n)) ?? wb.SheetNames[0]
  const sheet = wb.Sheets[resultsSheet]
  if (sheet) {
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
    for (let r = 0; r < Math.min(50, data.length); r++) {
      const row = data[r]
      if (Array.isArray(row) && row.length >= 2) {
        const key = String(row[0] ?? '').trim().toLowerCase()
        if (key.includes('experiment run end time') || key.includes('run end')) runStartedAt = String(row[1] ?? '').trim() || null
        if (key.includes('experiment name')) experimentName = String(row[1] ?? '').trim() || null
      }
    }
    let headerRowIdx = -1
    let wellPosIdx = -1
    let sampleIdx = -1
    let taskIdx = -1
    let ctIdx = -1
    let quantityIdx = -1
    let targetIdx = -1
    let ampStatusIdx = -1
    for (let r = 0; r < Math.min(60, data.length); r++) {
      const row = data[r]
      if (!Array.isArray(row)) continue
      const rowStr = row.map((c) => String(c ?? '')).join(' ').toLowerCase()
      if (rowStr.includes('well') && (rowStr.includes('ct') || rowStr.includes('sample'))) {
        headerRowIdx = r
        const headers = row.map((c) => String(c ?? ''))
        wellPosIdx = headers.findIndex((h) => /well position|well/i.test(h))
        sampleIdx = headers.findIndex((h) => /sample name/i.test(h))
        taskIdx = headers.findIndex((h) => /task/i.test(h))
        ctIdx = headers.findIndex((h) => /^ct$|ct mean/i.test(h))
        quantityIdx = headers.findIndex((h) => /quantity/i.test(h) && !/quantity mean|quantity sd/i.test(h))
        targetIdx = headers.findIndex((h) => /target name/i.test(h))
        ampStatusIdx = headers.findIndex((h) => /amp status/i.test(h))
        break
      }
    }
    if (headerRowIdx >= 0) {
      for (let r = headerRowIdx + 1; r < data.length; r++) {
        const row = data[r]
        if (!Array.isArray(row) || row.length < 2) continue
        const wellRaw = wellPosIdx >= 0 ? String(row[wellPosIdx] ?? '') : String(row[0] ?? '')
        const wellPosition = normalizeWell(wellRaw)
        if (!wellPosition) continue
        const sampleBarcode = (sampleIdx >= 0 ? String(row[sampleIdx] ?? '').trim() : '') || null
        let task = (taskIdx >= 0 ? String(row[taskIdx] ?? '').trim().toUpperCase() : 'UNKNOWN') || 'UNKNOWN'
        if (task !== 'STANDARD' && task !== 'NTC') task = 'UNKNOWN'
        let cq: number | null = null
        if (ctIdx >= 0) {
          const v = String(row[ctIdx] ?? '')
          if (v && v.toLowerCase() !== 'undetermined') cq = parseNum(v)
        }
        let quantity: number | null = null
        if (quantityIdx >= 0) quantity = parseNum(String(row[quantityIdx] ?? ''))
        const targetName = targetIdx >= 0 ? (String(row[targetIdx] ?? '').trim() || null) : null
        const ampStatus = ampStatusIdx >= 0 ? (String(row[ampStatusIdx] ?? '').trim() || null) : null
        wellResults.push({
          wellPosition,
          targetName,
          sampleBarcode,
          task,
          cq,
          quantity,
          standardQuantity: task === 'STANDARD' ? quantity : null,
          ampStatus,
        })
      }
    }
  }

  const ampSheet = wb.SheetNames.find((n) => /amplif/i.test(n))
  if (ampSheet) {
    const sheet = wb.Sheets[ampSheet]
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
    let headerRowIdx = -1
    let wellPosIdx = -1
    let cycleIdx = -1
    let targetIdx = -1
    let rnIdx = -1
    let deltaRnIdx = -1
    for (let r = 0; r < Math.min(50, data.length); r++) {
      const row = data[r]
      if (!Array.isArray(row)) continue
      const rowStr = row.map((c) => String(c ?? '')).join(' ').toLowerCase()
      if (rowStr.includes('cycle') && (rowStr.includes('rn') || rowStr.includes('delta'))) {
        headerRowIdx = r
        const headers = row.map((c) => String(c ?? ''))
        wellPosIdx = headers.findIndex((h) => /well position|well/i.test(h))
        cycleIdx = headers.findIndex((h) => /cycle/i.test(h))
        targetIdx = headers.findIndex((h) => /target name/i.test(h))
        rnIdx = headers.findIndex((h) => /^rn$|^rn\s/i.test(h))
        deltaRnIdx = headers.findIndex((h) => /delta rn|delta_rn/i.test(h))
        break
      }
    }
    if (headerRowIdx >= 0 && cycleIdx >= 0) {
      for (let r = headerRowIdx + 1; r < data.length; r++) {
        const row = data[r]
        if (!Array.isArray(row)) continue
        const wellPosition = normalizeWell(wellPosIdx >= 0 ? String(row[wellPosIdx] ?? '') : '')
        const cycleNum = parseInt(String(row[cycleIdx] ?? ''), 10)
        if (!wellPosition || Number.isNaN(cycleNum)) continue
        const targetName = targetIdx >= 0 ? (String(row[targetIdx] ?? '').trim() || null) : null
        const rn = rnIdx >= 0 ? parseNum(String(row[rnIdx] ?? '')) : null
        const deltaRn = deltaRnIdx >= 0 ? parseNum(String(row[deltaRnIdx] ?? '')) : null
        amplificationData.push({ wellPosition, targetName, cycle: cycleNum, rn, deltaRn })
      }
    }
  }

  return {
    runMetadata: {
      runStartedAt,
      runEndedAt: null,
      experimentName,
      fileName: fileName || null,
    },
    wellResults,
    amplificationData,
  }
}
