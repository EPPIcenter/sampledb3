export type ExportDownloadFormat = 'csv' | 'xlsx' | 'json'

export const EXPORT_MIME_TYPES: Record<ExportDownloadFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json',
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export type DownloadExportFileInput =
  | { kind: 'blob'; blob: Blob; filename: string }
  | { kind: 'base64'; data: string; format: ExportDownloadFormat; filename: string }
  | { kind: 'csv-text'; data: string; filename: string }
  | { kind: 'json-data'; data: unknown; filename: string }

export function downloadExportFile(input: DownloadExportFileInput): void {
  switch (input.kind) {
    case 'blob':
      triggerBlobDownload(input.blob, input.filename)
      break
    case 'base64':
      triggerBlobDownload(
        base64ToBlob(input.data, EXPORT_MIME_TYPES[input.format]),
        input.filename
      )
      break
    case 'csv-text':
      triggerBlobDownload(new Blob([input.data], { type: EXPORT_MIME_TYPES.csv }), input.filename)
      break
    case 'json-data':
      triggerBlobDownload(
        new Blob([JSON.stringify(input.data, null, 2)], { type: EXPORT_MIME_TYPES.json }),
        input.filename
      )
      break
  }
}

/** ADR-0002 POST export envelope (`data` field is base64 for csv/xlsx, JSON array for json). */
export function downloadPostExportEnvelope(params: {
  data: string | unknown
  format: ExportDownloadFormat
  filename?: string
  defaultFilename: string
}): void {
  const filename = params.filename || params.defaultFilename
  if (typeof params.data === 'string') {
    downloadExportFile({ kind: 'base64', data: params.data, format: params.format, filename })
  } else {
    downloadExportFile({ kind: 'json-data', data: params.data, filename })
  }
}

/** GET export response — blob for csv/xlsx, parsed JSON for json format. */
export function downloadGetExportResponse(params: {
  response: Blob | unknown
  format: ExportDownloadFormat
  filename: string
}): void {
  if (params.response instanceof Blob) {
    downloadExportFile({ kind: 'blob', blob: params.response, filename: params.filename })
  } else {
    downloadExportFile({ kind: 'json-data', data: params.response, filename: params.filename })
  }
}
