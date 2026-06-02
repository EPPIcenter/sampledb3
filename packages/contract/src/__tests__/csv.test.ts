import { describe, expect, it } from 'bun:test'
import { escapeCsvCell, parseCsv, serializeCsv, type CSVExportOptions } from '../csv'

describe('escapeCsvCell', () => {
  const cases: Array<{ name: string; input: string | number | null | undefined; expected: string }> = [
    { name: 'null', input: null, expected: '' },
    { name: 'undefined', input: undefined, expected: '' },
    { name: 'number', input: 42, expected: '42' },
    { name: 'simple string', input: 'hello', expected: 'hello' },
    { name: 'comma', input: 'a,b', expected: '"a,b"' },
    { name: 'double quote', input: 'say "hi"', expected: '"say ""hi"""' },
    { name: 'newline', input: 'line1\nline2', expected: '"line1\nline2"' },
    { name: 'carriage return', input: 'line1\rline2', expected: '"line1\rline2"' },
  ]

  for (const { name, input, expected } of cases) {
    it(name, () => {
      expect(escapeCsvCell(input)).toBe(expected)
    })
  }
})

describe('serializeCsv', () => {
  const plainOptions: CSVExportOptions = { bom: false, lineEnding: 'lf' }

  it('serializes header and rows with default CRLF and BOM', () => {
    const csv = serializeCsv(['Position', 'Barcode'], [['A01', 'MTX-001'], ['A02', '']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('Position,Barcode\r\nA01,MTX-001\r\nA02,')
  })

  it('serializes header only when there are no data rows', () => {
    expect(serializeCsv(['A'], [], plainOptions)).toBe('A')
  })

  it('escapes cells that need quoting', () => {
    expect(serializeCsv(['Col'], [['a,b']], plainOptions)).toBe('Col\n"a,b"')
  })

  it('supports custom delimiter', () => {
    expect(
      serializeCsv(['a', 'b'], [['1', '2']], { ...plainOptions, delimiter: ';' })
    ).toBe('a;b\n1;2')
  })
})

describe('parseCsv', () => {
  it('returns empty array for empty input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\uFEFF')).toEqual([])
  })

  it('strips a leading UTF-8 BOM before parsing', () => {
    expect(parseCsv('\uFEFFa,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  const parseCases: Array<{ name: string; input: string; expected: string[][] }> = [
    {
      name: 'simple comma-separated rows',
      input: 'a,b\n1,2',
      expected: [
        ['a', 'b'],
        ['1', '2'],
      ],
    },
    {
      name: 'CRLF line endings',
      input: 'a,b\r\n1,2',
      expected: [
        ['a', 'b'],
        ['1', '2'],
      ],
    },
    {
      name: 'quoted field with comma',
      input: 'name,value\n"Smith, Jane",42',
      expected: [
        ['name', 'value'],
        ['Smith, Jane', '42'],
      ],
    },
    {
      name: 'quoted field with escaped double quotes',
      input: 'text\n"say ""hi"""',
      expected: [['text'], ['say "hi"']],
    },
    {
      name: 'quoted field with embedded newline',
      input: 'a,b\n"line1\nline2",x',
      expected: [
        ['a', 'b'],
        ['line1\nline2', 'x'],
      ],
    },
    {
      name: 'trailing empty cells',
      input: 'h1,h2\nv1,',
      expected: [
        ['h1', 'h2'],
        ['v1', ''],
      ],
    },
  ]

  for (const { name, input, expected } of parseCases) {
    it(name, () => {
      expect(parseCsv(input)).toEqual(expected)
    })
  }
})

describe('serializeCsv + parseCsv round trip', () => {
  it('preserves values through canonical defaults', () => {
    const columns = ['subject_name', 'notes']
    const rows = [['SUBJ-001', 'comma, here'], ['SUBJ-002', 'line\nbreak']]
    const serialized = serializeCsv(columns, rows)
    expect(parseCsv(serialized)).toEqual([columns, ...rows])
  })
})
