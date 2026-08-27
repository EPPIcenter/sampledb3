import { describe, it, expect } from 'vitest'
import {
  deriveMissingCollections,
  getRequiredAndOptionalColumns,
  parseCsvPreview,
  parseFullCsv,
  resolveTemplateParentType,
  serializeToCsv,
} from '../derivations-bulk-import'
import type { ValidationResult } from '../api/derivations'
import type { BulkDerivationSettings } from '../api/derivations'

const emptySettings: BulkDerivationSettings = {
  derivationType: '',
  specimenTypeName: '',
  containerType: '',
  protocol: '',
  derivationDate: '',
}

describe('parseFullCsv', () => {
  it('returns empty for header-only or empty text', () => {
    expect(parseFullCsv('')).toEqual({ headers: [], rows: [] })
    expect(parseFullCsv('a,b')).toEqual({ headers: [], rows: [] })
  })

  it('parses headers and rows, trimming values', () => {
    const { headers, rows } = parseFullCsv('a,b\n 1 , 2 \n3,4')
    expect(headers).toEqual(['a', 'b'])
    expect(rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('preserves commas inside quoted fields', () => {
    const { rows } = parseFullCsv('name,notes\nx,"hello, world"')
    expect(rows[0].notes).toBe('hello, world')
  })

  it('skips blank lines', () => {
    const { rows } = parseFullCsv('a,b\n1,2\n\n3,4\n')
    expect(rows).toHaveLength(2)
  })
})

describe('parseCsvPreview', () => {
  it('returns at most five rows', () => {
    const csv = ['a,b', ...Array.from({ length: 8 }, (_, i) => `${i},${i}`)].join('\n')
    expect(parseCsvPreview(csv)).toHaveLength(5)
  })
})

describe('serializeToCsv round trip', () => {
  it('round-trips values containing commas, quotes, and newlines', () => {
    const headers = ['name', 'notes']
    const rows = [{ name: 'x', notes: 'a, "quoted" value' }]
    const csv = serializeToCsv(headers, rows)
    const parsed = parseFullCsv(csv)
    expect(parsed.headers).toEqual(headers)
    expect(parsed.rows).toEqual(rows)
  })

  it('fills missing cells with empty strings', () => {
    const csv = serializeToCsv(['a', 'b'], [{ a: '1' }])
    expect(parseFullCsv(csv).rows).toEqual([{ a: '1', b: '' }])
  })
})

describe('deriveMissingCollections', () => {
  const validation = (collections: ValidationResult['collections']): ValidationResult => ({
    rows: [],
    collections,
    summary: { total: 0, valid: 0, invalid: 0, warnings: 0 },
  })

  it('returns empty for null result', () => {
    expect(deriveMissingCollections(null)).toEqual([])
  })

  it('keeps only will_be_created tube collections, as pending with no location', () => {
    const result = deriveMissingCollections(
      validation([
        { name: 'P1', status: 'will_be_created', containerType: 'micronix_tube' },
        { name: 'B1', status: 'will_be_created', containerType: 'cryovial_tube' },
        { name: 'Bag', status: 'will_be_created', containerType: 'paper' },
        { name: 'P2', status: 'existing', containerType: 'micronix_tube' },
      ])
    )
    expect(result).toEqual([
      { name: 'P1', barcode: undefined, containerType: 'micronix_tube', locationId: null, status: 'pending' },
      { name: 'B1', barcode: undefined, containerType: 'cryovial_tube', locationId: null, status: 'pending' },
    ])
  })
})

describe('resolveTemplateParentType', () => {
  it('maps each source/parent combination', () => {
    expect(resolveTemplateParentType('control_batch', 'paper')).toBe('control_batch')
    expect(resolveTemplateParentType('control_batch', 'cryovial_tube')).toBe('control_batch')
    expect(resolveTemplateParentType('study_subject', 'paper')).toBe('study_subject')
    expect(resolveTemplateParentType('study_subject', 'cryovial_tube')).toBe('cryovial_position')
    expect(resolveTemplateParentType('study_subject', 'micronix_tube')).toBe('barcode')
  })
})

describe('getRequiredAndOptionalColumns', () => {
  it('control batch parents require batch name and specimen type', () => {
    const { required } = getRequiredAndOptionalColumns('control_batch', 'paper', emptySettings)
    expect(required).toContain('parent_control_batch_name')
    expect(required).toContain('parent_specimen_type_name')
    expect(required).not.toContain('parent_box_barcode')
  })

  it('control batch cryovial parents also require box and position', () => {
    const { required } = getRequiredAndOptionalColumns('control_batch', 'cryovial_tube', emptySettings)
    expect(required).toContain('parent_box_barcode')
    expect(required).toContain('parent_position')
  })

  it('study subject paper parents require the study chain', () => {
    const { required, optional } = getRequiredAndOptionalColumns('study_subject', 'paper', emptySettings)
    expect(required).toEqual(
      expect.arrayContaining(['parent_study_short_code', 'parent_subject_name', 'parent_specimen_type_name'])
    )
    expect(optional).toContain('parent_collection_date')
  })

  it('settings remove per-row columns from required', () => {
    const settings: BulkDerivationSettings = {
      ...emptySettings,
      derivationType: 'Extraction',
      specimenTypeName: 'DNA',
      containerType: 'micronix_tube',
      protocol: 'P',
      derivationDate: '2026-01-01',
    }
    const { required } = getRequiredAndOptionalColumns('study_subject', 'micronix_tube', settings)
    expect(required).not.toContain('derivation_type')
    expect(required).not.toContain('specimen_type_name')
    expect(required).toContain('plate_name or collection_barcode')
    expect(required).toContain('position')
  })

  it('paper child placement requires box_name or bag_name and sheet_name, not bag_name only', () => {
    const { required, optional } = getRequiredAndOptionalColumns('control_batch', 'paper', {
      ...emptySettings,
      containerType: 'paper',
    })
    expect(required).toContain('box_name or bag_name')
    expect(required).toContain('sheet_name')
    expect(required).not.toContain('bag_name')
    expect(required).not.toContain('position')
    expect(optional).toContain('sublabel')
    expect(optional).not.toContain('container_barcode')
    expect(optional).not.toContain('position')
  })

  it('unfixed child type requires the real position column, not sheet_name or a labelled alias', () => {
    const { required, optional } = getRequiredAndOptionalColumns('control_batch', 'paper', emptySettings)
    expect(required).toContain('position')
    expect(required).not.toContain('position (tube types)')
    expect(required).not.toContain('sheet_name')
    expect(optional).toContain('sheet_name')
    expect(optional).toContain('sublabel')
    expect(optional).toContain('container_barcode')
  })

  it('quantity fields are optional only when not set in settings', () => {
    const withQuantity = getRequiredAndOptionalColumns('control_batch', 'paper', {
      ...emptySettings,
      quantity: 5,
      unitSymbol: 'uL',
    })
    expect(withQuantity.optional).not.toContain('quantity')
    expect(withQuantity.optional).not.toContain('unit_symbol')

    const without = getRequiredAndOptionalColumns('control_batch', 'paper', emptySettings)
    expect(without.optional).toEqual(expect.arrayContaining(['quantity', 'unit_symbol']))
  })
})
