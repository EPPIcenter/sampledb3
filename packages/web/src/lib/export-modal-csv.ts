/**
 * CSV parsing for Export modal "CSV upload" mode (subject_name, collection_date, date_from, date_to).
 */

export interface ExportCsvRow {
  subject_name: string
  collection_date?: string
  date_from?: string
  date_to?: string
}

export function parseExportCsv(file: File): Promise<ExportCsvRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        if (!text) {
          reject(new Error('File is empty'))
          return
        }

        const lines = text.split('\n').filter((line) => line.trim())
        if (lines.length === 0) {
          reject(new Error('CSV file is empty'))
          return
        }

        const headerLine = lines[0].trim()
        const headers = headerLine.split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))

        const subjectNameIdx = headers.findIndex((h) => h === 'subject_name' || h === 'subject name')
        if (subjectNameIdx === -1) {
          reject(new Error('CSV must contain a "subject_name" column'))
          return
        }

        const collectionDateIdx = headers.findIndex((h) => h === 'collection_date' || h === 'collection date')
        const dateFromIdx = headers.findIndex((h) => h === 'date_from' || h === 'date from')
        const dateToIdx = headers.findIndex((h) => h === 'date_to' || h === 'date to')

        const data: ExportCsvRow[] = []

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          const values: string[] = []
          let current = ''
          let inQuotes = false

          for (let j = 0; j < line.length; j++) {
            const char = line[j]
            if (char === '"') {
              if (inQuotes && line[j + 1] === '"') {
                current += '"'
                j++
              } else {
                inQuotes = !inQuotes
              }
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          values.push(current.trim())

          const subjectName = values[subjectNameIdx]?.replace(/^"|"$/g, '').trim()
          if (!subjectName) continue

          const row: ExportCsvRow = { subject_name: subjectName }

          if (collectionDateIdx >= 0 && values[collectionDateIdx]) {
            const date = values[collectionDateIdx].replace(/^"|"$/g, '').trim()
            if (date) row.collection_date = date
          }
          if (dateFromIdx >= 0 && values[dateFromIdx]) {
            const date = values[dateFromIdx].replace(/^"|"$/g, '').trim()
            if (date) row.date_from = date
          }
          if (dateToIdx >= 0 && values[dateToIdx]) {
            const date = values[dateToIdx].replace(/^"|"$/g, '').trim()
            if (date) row.date_to = date
          }

          data.push(row)
        }

        if (data.length === 0) {
          reject(new Error('No valid data rows found in CSV'))
          return
        }

        resolve(data)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to parse CSV'
        reject(new Error(`Failed to parse CSV: ${message}`))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
