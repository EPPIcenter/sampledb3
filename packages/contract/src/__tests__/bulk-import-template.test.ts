import { describe, expect, it } from 'bun:test'
import {
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
} from '../bulk-combined'
import {
  BULK_IMPORT_CONTAINER_TEMPLATES,
  getBulkImportOptionalColumns,
  getBulkImportRequiredColumns,
  getBulkImportRowCollectionRef,
  getBulkImportTemplateColumns,
  mapBulkImportTemplateCsv,
  toBulkCombinedImportRequest,
} from '../bulk-import-template'

describe('bulk-import-template column definitions', () => {
  it('defines exact template columns in order for each container type', () => {
    expect(getBulkImportTemplateColumns({ containerType: 'none' })).toEqual([
      'study_short_code',
      'subject_name',
      'specimen_type_name',
      'collection_date',
    ])
    expect(getBulkImportTemplateColumns({ containerType: 'micronix_tube' })).toEqual([
      'study_short_code',
      'subject_name',
      'specimen_type_name',
      'collection_date',
      'plate_name',
      'barcode',
      'position',
      'comment',
    ])
    expect(getBulkImportTemplateColumns({ containerType: 'cryovial_tube' })).toEqual([
      'study_short_code',
      'subject_name',
      'specimen_type_name',
      'collection_date',
      'box_name',
      'barcode',
      'position',
      'comment',
    ])
    expect(getBulkImportTemplateColumns({ containerType: 'paper' })).toEqual([
      'study_short_code',
      'subject_name',
      'specimen_type_name',
      'collection_date',
      'box_name',
      'bag_name',
      'sheet_name',
      'sublabel',
      'comment',
    ])
    expect(getBulkImportTemplateColumns({ containerType: 'static_well' })).toEqual([
      'study_short_code',
      'subject_name',
      'specimen_type_name',
      'collection_date',
      'plate_name',
      'position',
      'comment',
    ])
  })

  it('omits study_short_code from template and required columns when a default Study is set', () => {
    expect(
      getBulkImportTemplateColumns({ containerType: 'micronix_tube', defaultStudyShortCode: 'ST1' }),
    ).toEqual([
      'subject_name',
      'specimen_type_name',
      'collection_date',
      'plate_name',
      'barcode',
      'position',
      'comment',
    ])
    expect(
      getBulkImportRequiredColumns({ containerType: 'paper', defaultStudyShortCode: 'ST1' }),
    ).toEqual(['subject_name', 'specimen_type_name', 'box_name or bag_name', 'sheet_name'])
  })

  it('exposes required and optional fields per container type', () => {
    expect(getBulkImportRequiredColumns({ containerType: 'micronix_tube' })).toEqual([
      'study_short_code',
      'subject_name',
      'specimen_type_name',
      'plate_name',
      'barcode',
      'position',
    ])
    expect(getBulkImportRequiredColumns({ containerType: 'cryovial_tube' })).toEqual([
      'study_short_code',
      'subject_name',
      'specimen_type_name',
      'box_name',
      'position',
    ])
    expect(getBulkImportRequiredColumns({ containerType: 'static_well' })).toEqual([
      'study_short_code',
      'subject_name',
      'specimen_type_name',
      'plate_name',
      'position',
    ])
    expect(getBulkImportOptionalColumns('none')).toEqual([])
    expect(getBulkImportOptionalColumns('micronix_tube')).toEqual(['comment'])
    expect(getBulkImportOptionalColumns('cryovial_tube')).toEqual(['barcode', 'comment'])
    expect(getBulkImportOptionalColumns('paper')).toEqual(['sublabel', 'comment'])
    expect(getBulkImportOptionalColumns('static_well')).toEqual(['comment'])
    expect(BULK_IMPORT_CONTAINER_TEMPLATES.paper.collectionTypes).toEqual(['box', 'bag'])
  })
})

describe('mapBulkImportTemplateCsv — subjects, studies, and options', () => {
  it('groups rows for the same Subject into one Subject entry and preserves spreadsheet rowIndex', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name,collection_date',
      'S1,Sub1,Whole Blood,2024-01-15',
      'S1,Sub2,Serum,',
      'S1,Sub1,Plasma,2024-02-01',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, {
      containerType: 'none',
      atomicMode: 'per_subject',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.fileRows).toEqual([2, 3, 4])
    expect(result.validateRequest).toEqual({
      atomicMode: 'per_subject',
      subjects: [
        {
          studyShortCode: 'S1',
          subjectName: 'Sub1',
          specimens: [
            { specimenTypeName: 'Whole Blood', collectionDate: '2024-01-15', rowIndex: 2 },
            { specimenTypeName: 'Plasma', collectionDate: '2024-02-01', rowIndex: 4 },
          ],
        },
        {
          studyShortCode: 'S1',
          subjectName: 'Sub2',
          specimens: [{ specimenTypeName: 'Serum', rowIndex: 3 }],
        },
      ],
    })
    expect(result.validateRequest).not.toHaveProperty('studyShortCode')
    expect(bulkCombinedValidateRequestSchema.safeParse(result.validateRequest).success).toBe(true)

    expect(result.importRequest).toEqual(toBulkCombinedImportRequest(result.validateRequest))
    expect(result.importRequest.subjects[0]!.specimens[0]).not.toHaveProperty('rowIndex')
    expect(bulkCombinedRequestSchema.safeParse(result.importRequest).success).toBe(true)
  })

  it('keeps each row study for a file spanning multiple Studies and separates same-named Subjects', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name',
      'STA,P001,DBS',
      'STB,P001,DBS',
      'STC,P002,DBS',
      'STA,P003,DBS',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'none' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.validateRequest.atomicMode).toBe('full_file')
    expect(result.validateRequest).not.toHaveProperty('studyShortCode')
    expect(result.validateRequest.subjects.map((s) => [s.studyShortCode, s.subjectName])).toEqual([
      ['STA', 'P001'],
      ['STB', 'P001'],
      ['STC', 'P002'],
      ['STA', 'P003'],
    ])
    expect(result.importRequest.subjects.map((s) => s.studyShortCode)).toEqual([
      'STA',
      'STB',
      'STC',
      'STA',
    ])
  })

  it('applies defaultStudyShortCode to a file with no study_short_code column', () => {
    const csv = [
      'subject_name,specimen_type_name',
      'A,Whole Blood',
      'B,Serum',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, {
      containerType: 'none',
      defaultStudyShortCode: 'FIXED',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.validateRequest.studyShortCode).toBe('FIXED')
    expect(result.validateRequest.subjects.map((s) => s.studyShortCode)).toEqual(['FIXED', 'FIXED'])
    expect(result.importRequest.studyShortCode).toBe('FIXED')
  })

  it('lets a row study_short_code win over defaultStudyShortCode while filling blank cells from default', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name',
      'STA,Sub1,Whole Blood',
      ',Sub2,Serum',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, {
      containerType: 'none',
      defaultStudyShortCode: 'DEFAULT',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.validateRequest.studyShortCode).toBe('DEFAULT')
    expect(result.validateRequest.subjects.map((s) => [s.studyShortCode, s.subjectName])).toEqual([
      ['STA', 'Sub1'],
      ['DEFAULT', 'Sub2'],
    ])
  })

  it('preserves subject names containing colons without splitting keys', () => {
    const csv = 'study_short_code,subject_name,specimen_type_name\nS,SITE:001,Whole Blood'
    const result = mapBulkImportTemplateCsv(csv, { containerType: 'none' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.validateRequest.subjects[0]!.subjectName).toBe('SITE:001')
  })
})

describe('mapBulkImportTemplateCsv — blank rows, header aliases, and CSV edge cases', () => {
  it('skips blank and comma-only rows while keeping spreadsheet row numbers (header is row 1)', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name',
      'S1,Sub1,Serum',
      '',
      'S2,Sub2,Plasma',
      ',,',
      'S1,Sub1,Whole Blood',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'none' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.fileRows).toEqual([2, 4, 6])
    expect(result.validateRequest.subjects[0]!.specimens.map((s) => s.rowIndex)).toEqual([2, 6])
    expect(result.validateRequest.subjects[1]!.specimens.map((s) => s.rowIndex)).toEqual([4])
  })

  it('reports missing required cells with their spreadsheet row after blank rows', () => {
    const csv = [
      'subject_name,specimen_type_name,plate_name,barcode,position',
      'S1,Serum,P1,MT1,A01',
      ',,,,',
      'S2,Serum,P1,,A02',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, {
      containerType: 'micronix_tube',
      defaultStudyShortCode: 'ST',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors).toEqual([
      { rowIndex: 4, column: 'barcode', message: 'Missing required value: barcode' },
    ])
  })

  it('accepts header aliases (case-insensitive, well_position, well) and handles BOM, CRLF, and quoted commas', () => {
    const csv =
      '\uFEFFStudy_Short_Code,SUBJECT_NAME,Specimen_Type_Name,Plate_Name,Barcode,WELL_POSITION,Comment\r\n' +
      'ST1,Subj1,Serum,Plate-1,MTX-1,A01,"low vol, hemolyzed"\r\n'

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'micronix_tube' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'micronix_tube',
      barcode: 'MTX-1',
      comment: 'low vol, hemolyzed',
      collection: {
        type: 'micronix_plate',
        name: 'Plate-1',
        position: 'A01',
      },
    })

    const withWell = mapBulkImportTemplateCsv(
      'subject_name,specimen_type_name,plate_name,Well\nSubj1,DNA,Plate-2,B02',
      { containerType: 'static_well', defaultStudyShortCode: 'ST1' },
    )
    expect(withWell.ok).toBe(true)
    if (!withWell.ok) return
    expect(withWell.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'static_well',
      collection: {
        type: 'micronix_plate',
        name: 'Plate-2',
        position: 'B02',
      },
    })
  })

  it('does not alias legacy collection_name column (ADR 0006)', () => {
    const csv =
      'study_short_code,subject_name,specimen_type_name,collection_name,barcode,position\n' +
      'ST1,S1,Serum,LegacyPlate,MT1,A01'

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'micronix_tube' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      {
        rowIndex: 2,
        column: 'plate_name',
        message: 'Missing required value: plate_name (or collection_barcode)',
      },
    ])
  })

  it('reports errors for empty, header-only, and malformed quoted CSVs', () => {
    expect(mapBulkImportTemplateCsv('', { containerType: 'none' })).toMatchObject({
      ok: false,
      errors: [{ message: 'CSV file is empty or has no data rows' }],
    })
    expect(
      mapBulkImportTemplateCsv('study_short_code,subject_name,specimen_type_name\n,,\n', {
        containerType: 'none',
      }),
    ).toMatchObject({
      ok: false,
      errors: [{ message: 'CSV file is empty or has no data rows' }],
    })
    expect(
      mapBulkImportTemplateCsv('study_short_code,subject_name\n"ST1,S1', { containerType: 'none' }),
    ).toMatchObject({
      ok: false,
      errors: [{ message: 'Unclosed quoted CSV field' }],
    })
  })
})

describe('mapBulkImportTemplateCsv — container types and collections', () => {
  it('maps micronix_tube with plate_name, barcode, position, comment, and collection_barcode', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name,plate_name,collection_barcode,barcode,position,comment',
      'ST1,S1,Serum,Plate-A,PB-1,MT-1,A01,note',
      'ST1,S2,Serum,,PB-2,MT-2,A02,',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'micronix_tube' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.collections).toEqual([
      { type: 'micronix_plate', name: 'Plate-A', barcode: 'PB-1' },
      { type: 'micronix_plate', barcode: 'PB-2' },
    ])
    expect(result.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'micronix_tube',
      barcode: 'MT-1',
      comment: 'note',
      collection: {
        type: 'micronix_plate',
        name: 'Plate-A',
        barcode: 'PB-1',
        position: 'A01',
      },
    })
    expect(result.validateRequest.subjects[1]!.specimens[0]!.container).toEqual({
      containerType: 'micronix_tube',
      barcode: 'MT-2',
      collection: {
        type: 'micronix_plate',
        barcode: 'PB-2',
        position: 'A02',
      },
    })
    expect(bulkCombinedValidateRequestSchema.safeParse(result.validateRequest).success).toBe(true)
  })

  it('maps cryovial_tube with optional barcode and required box_name/position', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name,box_name,barcode,position,comment',
      'ST1,S1,Plasma,Box-1,,B01,',
      'ST1,S2,Plasma,Box-1,CV-2,B02,ok',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'cryovial_tube' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.collections).toEqual([{ type: 'cryovial_box', name: 'Box-1' }])
    expect(result.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'cryovial_tube',
      collection: { type: 'cryovial_box', name: 'Box-1', position: 'B01' },
    })
    expect(result.validateRequest.subjects[1]!.specimens[0]!.container).toEqual({
      containerType: 'cryovial_tube',
      barcode: 'CV-2',
      comment: 'ok',
      collection: { type: 'cryovial_box', name: 'Box-1', position: 'B02' },
    })
    expect(bulkCombinedValidateRequestSchema.safeParse(result.validateRequest).success).toBe(true)
  })

  it('maps static_well with plate_name, position, and optional comment', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name,plate_name,position,comment',
      'ST1,S1,DNA,Plate-W,C03,extracted',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'static_well' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.collections).toEqual([{ type: 'micronix_plate', name: 'Plate-W' }])
    expect(result.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'static_well',
      comment: 'extracted',
      collection: { type: 'micronix_plate', name: 'Plate-W', position: 'C03' },
    })
    expect(bulkCombinedValidateRequestSchema.safeParse(result.validateRequest).success).toBe(true)
  })

  it('maps paper with box or bag parent, sheet_name, optional sublabel and comment, ignoring collection_barcode', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name,box_name,bag_name,sheet_name,sublabel,comment,collection_barcode',
      'ST1,S1,DBS,Box-A,,Sheet-1,Spot-A,note,IGNORED-1',
      'ST1,S2,DBS,,Bag-A,Sheet-2,,,IGNORED-2',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'paper' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.collections).toEqual([
      { type: 'box', name: 'Box-A' },
      { type: 'bag', name: 'Bag-A' },
    ])
    expect(result.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'paper',
      sublabel: 'Spot-A',
      comment: 'note',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'box', name: 'Box-A' },
      },
    })
    expect(result.validateRequest.subjects[1]!.specimens[0]!.container).toEqual({
      containerType: 'paper',
      collection: {
        type: 'sheet',
        name: 'Sheet-2',
        parent: { type: 'bag', name: 'Bag-A' },
      },
    })
    expect(bulkCombinedValidateRequestSchema.safeParse(result.validateRequest).success).toBe(true)
  })

  it('validates paper parent (box_name or bag_name, not both), sheet_name, and rejects barcode column', () => {
    const csv = [
      'study_short_code,subject_name,specimen_type_name,box_name,bag_name,sheet_name,barcode',
      'ST,S1,DBS,B1,G1,Sheet1,',
      'ST,S2,DBS,,,,',
      'ST,S3,DBS,B2,,Sheet2,LEGACY-BC',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, { containerType: 'paper' })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors).toEqual([
      { rowIndex: 2, column: 'box_name', message: 'Provide either box_name or bag_name, not both' },
      { rowIndex: 3, column: 'box_name', message: 'Missing required value: box_name or bag_name' },
      { rowIndex: 3, column: 'sheet_name', message: 'Missing required value: sheet_name' },
      {
        rowIndex: 4,
        column: 'barcode',
        value: 'LEGACY-BC',
        message: 'Paper containers use sublabel for spot identifiers, not barcode',
      },
    ])
  })

  it('propagates a file-provided collection_barcode to earlier blank rows of the same Collection and rejects conflicting barcodes', () => {
    const validCsv = [
      'subject_name,specimen_type_name,plate_name,collection_barcode,barcode,position',
      'Sub1,Serum,Plate-New,,MT-1,A01',
      'Sub2,Serum,Plate-New,PB-999,MT-2,A02',
    ].join('\n')

    const okResult = mapBulkImportTemplateCsv(validCsv, {
      containerType: 'micronix_tube',
      defaultStudyShortCode: 'S',
      collections: [{ type: 'micronix_plate', name: 'Plate-New', barcode: 'PB-999', locationId: 5 }],
    })
    expect(okResult.ok).toBe(true)
    if (!okResult.ok) return

    expect(okResult.collections).toEqual([
      { type: 'micronix_plate', name: 'Plate-New', barcode: 'PB-999' },
    ])
    const containers = okResult.validateRequest.subjects.flatMap((s) =>
      s.specimens.map((sp) => sp.container),
    )
    expect(containers).toEqual([
      {
        containerType: 'micronix_tube',
        barcode: 'MT-1',
        collection: {
          type: 'micronix_plate',
          name: 'Plate-New',
          barcode: 'PB-999',
          position: 'A01',
          locationId: 5,
        },
      },
      {
        containerType: 'micronix_tube',
        barcode: 'MT-2',
        collection: {
          type: 'micronix_plate',
          name: 'Plate-New',
          barcode: 'PB-999',
          position: 'A02',
          locationId: 5,
        },
      },
    ])

    const conflictCsv = [
      'subject_name,specimen_type_name,plate_name,collection_barcode,barcode,position',
      'S1,Serum,Plate-New,PB-111,MT-1,A01',
      ',,,,,',
      'S2,Serum,Plate-New,PB-222,MT-2,A02',
    ].join('\n')

    const badResult = mapBulkImportTemplateCsv(conflictCsv, {
      containerType: 'micronix_tube',
      defaultStudyShortCode: 'S',
    })
    expect(badResult.ok).toBe(false)
    if (badResult.ok) return

    expect(badResult.errors).toEqual([
      {
        rowIndex: 4,
        column: 'collection_barcode',
        value: 'PB-222',
        message: "Collection 'Plate-New' has conflicting collection_barcode 'PB-222' (row 2 has 'PB-111')",
      },
    ])
  })

  it('applies locationId 0 (root), trimmed override barcode, and keys overrides by Collection type', () => {
    const micronixCsv =
      'subject_name,specimen_type_name,plate_name,barcode,position\nSub1,T,Pl1,BC-1,A01'
    const micronix = mapBulkImportTemplateCsv(micronixCsv, {
      containerType: 'micronix_tube',
      defaultStudyShortCode: 'S',
      collections: [
        { type: 'micronix_plate', name: 'Pl1', locationId: 0, barcode: '  PB-99  ' },
        { type: 'cryovial_box', name: 'Pl1', locationId: 99, barcode: 'CB-WRONG' },
      ],
    })
    expect(micronix.ok).toBe(true)
    if (!micronix.ok) return

    expect(micronix.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'micronix_tube',
      barcode: 'BC-1',
      collection: {
        type: 'micronix_plate',
        name: 'Pl1',
        barcode: 'PB-99',
        position: 'A01',
        locationId: 0,
      },
    })

    const paperCsv = [
      'subject_name,specimen_type_name,box_name,bag_name,sheet_name',
      'Sub1,DBS,Archive-1,,Sheet-1',
      'Sub2,DBS,,Archive-1,Sheet-2',
    ].join('\n')

    const bothMissing = mapBulkImportTemplateCsv(paperCsv, {
      containerType: 'paper',
      defaultStudyShortCode: 'S',
      collections: [
        { type: 'box', name: 'Archive-1', locationId: 10 },
        { type: 'bag', name: 'Archive-1', locationId: 20 },
      ],
    })
    expect(bothMissing.ok).toBe(true)
    if (!bothMissing.ok) return

    expect(bothMissing.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'paper',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'box', name: 'Archive-1', locationId: 10 },
      },
    })
    expect(bothMissing.validateRequest.subjects[1]!.specimens[0]!.container).toEqual({
      containerType: 'paper',
      collection: {
        type: 'sheet',
        name: 'Sheet-2',
        parent: { type: 'bag', name: 'Archive-1', locationId: 20 },
      },
    })

    // Missing bag location must NOT apply to an existing box with the same name.
    const bagOnlyMissing = mapBulkImportTemplateCsv(paperCsv, {
      containerType: 'paper',
      defaultStudyShortCode: 'S',
      collections: [{ type: 'bag', name: 'Archive-1', locationId: 20 }],
    })
    expect(bagOnlyMissing.ok).toBe(true)
    if (!bagOnlyMissing.ok) return

    expect(bagOnlyMissing.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'paper',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'box', name: 'Archive-1' },
      },
    })
    expect(bagOnlyMissing.validateRequest.subjects[1]!.specimens[0]!.container).toEqual({
      containerType: 'paper',
      collection: {
        type: 'sheet',
        name: 'Sheet-2',
        parent: { type: 'bag', name: 'Archive-1', locationId: 20 },
      },
    })
  })

  it('extracts per-row Collection references via getBulkImportRowCollectionRef', () => {
    expect(getBulkImportRowCollectionRef({ plate_name: 'PLATE-001' }, 'micronix_tube')).toEqual({
      type: 'micronix_plate',
      name: 'PLATE-001',
    })
    expect(getBulkImportRowCollectionRef({ collection_barcode: 'my box' }, 'cryovial_tube')).toEqual({
      type: 'cryovial_box',
      barcode: 'my box',
    })
    expect(
      getBulkImportRowCollectionRef(
        { plate_name: 'Plate A', collection_barcode: 'PB-1' },
        'static_well',
      ),
    ).toEqual({ type: 'micronix_plate', name: 'Plate A', barcode: 'PB-1' })
    expect(getBulkImportRowCollectionRef({ bag_name: 'Bag-A' }, 'paper')).toEqual({
      type: 'bag',
      name: 'Bag-A',
    })
    expect(getBulkImportRowCollectionRef({ box_name: 'B', bag_name: 'G' }, 'paper')).toBeUndefined()
    expect(getBulkImportRowCollectionRef({ plate_name: 'P' }, 'none')).toBeUndefined()
  })

  it('applies locationId override by barcode when a row gives collection_barcode without a Collection name', () => {
    const csv = [
      'subject_name,specimen_type_name,collection_barcode,barcode,position',
      'S1,Serum,plate 7,MT1,A01',
    ].join('\n')

    const result = mapBulkImportTemplateCsv(csv, {
      containerType: 'micronix_tube',
      defaultStudyShortCode: 'ST',
      collections: [{ type: 'micronix_plate', barcode: 'plate 7', locationId: 10 }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.validateRequest.subjects[0]!.specimens[0]!.container).toEqual({
      containerType: 'micronix_tube',
      barcode: 'MT1',
      collection: {
        type: 'micronix_plate',
        barcode: 'plate 7',
        position: 'A01',
        locationId: 10,
      },
    })
  })

  it('requires study_short_code on every row when defaultStudyShortCode is omitted', () => {
    const csv = 'study_short_code,subject_name,specimen_type_name\n,S1,Serum'
    const result = mapBulkImportTemplateCsv(csv, { containerType: 'none' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      { rowIndex: 2, column: 'study_short_code', message: 'Missing required value: study_short_code' },
    ])
  })
})
