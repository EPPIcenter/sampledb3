import { describe, it, expect, vi, afterEach } from 'vitest'
import { exportApi } from '../export'
import * as exportDownload from '../../export-download'

vi.mock('../../export-download', () => ({
  downloadPostExportEnvelope: vi.fn(),
  downloadGetExportResponse: vi.fn(),
  downloadExportFile: vi.fn(),
}))

describe('exportApi download helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloadEnvelope delegates to downloadPostExportEnvelope', () => {
    exportApi.downloadEnvelope(
      { data: btoa('csv'), format: 'csv', filename: 'study.csv' },
      { defaultFilename: 'fallback.csv' }
    )

    expect(exportDownload.downloadPostExportEnvelope).toHaveBeenCalledWith({
      data: btoa('csv'),
      format: 'csv',
      filename: 'study.csv',
      defaultFilename: 'fallback.csv',
    })
  })

  it('downloadGetResponse delegates to downloadGetExportResponse', () => {
    const blob = new Blob(['csv'], { type: 'text/csv' })
    exportApi.downloadGetResponse({ response: blob, format: 'csv', filename: 'export.csv' })

    expect(exportDownload.downloadGetExportResponse).toHaveBeenCalledWith({
      response: blob,
      format: 'csv',
      filename: 'export.csv',
    })
  })

  it('downloadBlob delegates to downloadExportFile', () => {
    const blob = new Blob(['csv'], { type: 'text/csv' })
    exportApi.downloadBlob(blob, 'specimens.csv')

    expect(exportDownload.downloadExportFile).toHaveBeenCalledWith({
      kind: 'blob',
      blob,
      filename: 'specimens.csv',
    })
  })
})
