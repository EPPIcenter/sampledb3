import {
  parseBarcodeExportFilterCsv,
  parseMultiStudyExportFilterCsv,
  parseSingleStudyExportFilterCsv,
  type MultiStudyExportFilterRow,
  type SingleStudyExportFilterRow,
} from '@sampledb/contract'

export type { MultiStudyExportFilterRow, SingleStudyExportFilterRow }

export type MultiStudyExportCsvRow = MultiStudyExportFilterRow
export type SingleStudyExportCsvRow = SingleStudyExportFilterRow

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      if (typeof text !== 'string' || !text) {
        reject(new Error('File is empty'))
        return
      }
      resolve(text)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

function wrapParseError(err: unknown): Error {
  const message = err instanceof Error ? err.message : 'Failed to parse CSV'
  return new Error(message.startsWith('Failed to parse CSV') ? message : `Failed to parse CSV: ${message}`)
}

export async function parseMultiStudyExportFilterFile(file: File): Promise<MultiStudyExportFilterRow[]> {
  try {
    return parseMultiStudyExportFilterCsv(await readFileAsText(file))
  } catch (err) {
    throw wrapParseError(err)
  }
}

export async function parseSingleStudyExportFilterFile(file: File): Promise<SingleStudyExportFilterRow[]> {
  try {
    return parseSingleStudyExportFilterCsv(await readFileAsText(file))
  } catch (err) {
    throw wrapParseError(err)
  }
}

export async function parseBarcodeExportFilterFile(file: File): Promise<string[]> {
  try {
    return parseBarcodeExportFilterCsv(await readFileAsText(file))
  } catch (err) {
    throw wrapParseError(err)
  }
}

/** Multi-study Export page upload parser. */
export const parseExportCsv = parseMultiStudyExportFilterFile

/** Export modal single-study upload parser. */
export const parseExportModalCsv = parseSingleStudyExportFilterFile
