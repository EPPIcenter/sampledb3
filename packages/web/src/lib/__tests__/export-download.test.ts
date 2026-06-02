import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  base64ToBlob,
  downloadExportFile,
  downloadGetExportResponse,
  downloadPostExportEnvelope,
  triggerBlobDownload,
} from '../export-download'

describe('export-download', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('base64ToBlob', () => {
    it('decodes base64 into a blob with the requested MIME type', () => {
      const original = 'Position,Barcode\r\nA01,001'
      const base64 = btoa(original)
      const blob = base64ToBlob(base64, 'text/csv')
      expect(blob.type).toBe('text/csv')
      expect(blob.size).toBe(original.length)
    })
  })

  describe('triggerBlobDownload', () => {
    it('creates an object URL, clicks a link, and revokes the URL', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const click = vi.fn()
      const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
      const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)
      vi.spyOn(document, 'createElement').mockReturnValue({
        click,
        href: '',
        download: '',
      } as unknown as HTMLAnchorElement)

      triggerBlobDownload(new Blob(['test'], { type: 'text/csv' }), 'export.csv')

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(click).toHaveBeenCalled()
      expect(appendChild).toHaveBeenCalled()
      expect(removeChild).toHaveBeenCalled()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    })
  })

  describe('downloadExportFile', () => {
    it('downloads csv text without base64 decoding', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.spyOn(document, 'createElement').mockReturnValue({
        click: vi.fn(),
      } as unknown as HTMLAnchorElement)
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

      downloadExportFile({ kind: 'csv-text', data: 'A,B\r\n1,2', filename: 'table.csv' })

      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toBe('text/csv')
    })

    it('downloads base64 csv payloads', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.spyOn(document, 'createElement').mockReturnValue({
        click: vi.fn(),
      } as unknown as HTMLAnchorElement)
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

      downloadExportFile({
        kind: 'base64',
        data: btoa('csv-content'),
        format: 'csv',
        filename: 'study.csv',
      })

      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toBe('text/csv')
    })
  })

  describe('downloadPostExportEnvelope', () => {
    it('routes string data through base64 download', () => {
      const spy = vi.spyOn({ downloadExportFile }, 'downloadExportFile')
      // use direct call and verify via createObjectURL instead
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.spyOn(document, 'createElement').mockReturnValue({
        click: vi.fn(),
      } as unknown as HTMLAnchorElement)
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

      downloadPostExportEnvelope({
        data: btoa('xlsx-bytes'),
        format: 'xlsx',
        defaultFilename: 'export.xlsx',
      })

      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      spy.mockRestore()
    })

    it('routes json array data through json download', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.spyOn(document, 'createElement').mockReturnValue({
        click: vi.fn(),
      } as unknown as HTMLAnchorElement)
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

      downloadPostExportEnvelope({
        data: [{ container_id: 1 }],
        format: 'json',
        filename: 'study.json',
        defaultFilename: 'fallback.json',
      })

      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toBe('application/json')
    })
  })

  describe('downloadGetExportResponse', () => {
    it('passes through blob responses', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.spyOn(document, 'createElement').mockReturnValue({
        click: vi.fn(),
      } as unknown as HTMLAnchorElement)
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

      const blob = new Blob(['csv'], { type: 'text/csv' })
      downloadGetExportResponse({ response: blob, format: 'csv', filename: 'specimens.csv' })

      expect(createObjectURL).toHaveBeenCalledWith(blob)
    })
  })
})
