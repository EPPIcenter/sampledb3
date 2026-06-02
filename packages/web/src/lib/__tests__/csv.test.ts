import { describe, it, expect, vi, afterEach } from 'vitest'
import { escapeCsvCell, buildCsv, downloadCsv } from '../csv'

describe('csv', () => {
  describe('escapeCsvCell', () => {
    it('returns empty string for null and undefined', () => {
      expect(escapeCsvCell(null)).toBe('')
      expect(escapeCsvCell(undefined)).toBe('')
    })

    it('converts number to string without quoting', () => {
      expect(escapeCsvCell(0)).toBe('0')
      expect(escapeCsvCell(42)).toBe('42')
    })

    it('returns simple string without quotes', () => {
      expect(escapeCsvCell('hello')).toBe('hello')
    })

    it('wraps in quotes and escapes internal quotes when value contains comma', () => {
      expect(escapeCsvCell('a,b')).toBe('"a,b"')
    })

    it('wraps in quotes and doubles internal double quotes', () => {
      expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    })

    it('wraps in quotes when value contains newline', () => {
      expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
    })
  })

  describe('buildCsv', () => {
    const lfNoBom = { bom: false, lineEnding: 'lf' as const }

    it('builds header row and data rows with canonical defaults (BOM + CRLF)', () => {
      const csv = buildCsv(
        ['Position', 'Barcode'],
        [['A01', 'MTX-001'], ['A02', '']]
      )
      expect(csv.charCodeAt(0)).toBe(0xfeff)
      expect(csv.slice(1)).toBe('Position,Barcode\r\nA01,MTX-001\r\nA02,')
    })

    it('escapes cells that contain comma', () => {
      const csv = buildCsv(['Col'], [['a,b']], lfNoBom)
      expect(csv).toBe('Col\n"a,b"')
    })

    it('includes BOM when requested explicitly (default is already on)', () => {
      const csv = buildCsv(['A'], [['x']], { bom: true })
      expect(csv.charCodeAt(0)).toBe(0xfeff)
      expect(csv.slice(1)).toBe('A\r\nx')
    })

    it('can disable BOM and use LF for legacy-style output', () => {
      const csv = buildCsv(['A'], [['x']], lfNoBom)
      expect(csv).toBe('A\nx')
    })
  })

  describe('downloadCsv', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('creates a blob with CSV content and revokes the object URL', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

      downloadCsv('Position\nA01', 'plate-1.csv')

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toBe('text/csv')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    })
  })
})
