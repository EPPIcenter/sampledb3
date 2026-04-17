import { describe, it, expect } from 'vitest'
import { canProceedToReview } from '../ControlBatchWizard'
import type { SpecimenTypeConfig, CSVFileData } from '../ControlBatchWizard'

function makeSpecimenType(overrides: Partial<SpecimenTypeConfig> = {}): SpecimenTypeConfig {
  return {
    id: '1',
    specimenTypeId: 1,
    specimenTypeName: 'Whole Blood',
    containerType: 'paper',
    containers: [],
    ...overrides,
  }
}

function makeCsvFile(overrides: Partial<CSVFileData> = {}): CSVFileData {
  return {
    filename: 'test.csv',
    rows: [{ specimen_type_name: 'Whole Blood' }],
    errors: [],
    collectionId: 1,
    collectionName: 'Test Box',
    containerType: 'cryovial_tube',
    ...overrides,
  }
}

describe('canProceedToReview', () => {
  it('returns false when manual specimen types have no containers and no CSV files exist', () => {
    const result = canProceedToReview(
      [makeSpecimenType({ containers: [] })],
      [],
    )
    expect(result).toBe(false)
  })

  it('returns false when some manual specimen types have containers but others do not, even with no CSV files', () => {
    const result = canProceedToReview(
      [
        makeSpecimenType({
          id: '1',
          containers: [{ id: 'c1', quantity: 1, unitSymbol: 'spots' }],
        }),
        makeSpecimenType({ id: '2', containers: [] }),
      ],
      [],
    )
    expect(result).toBe(false)
  })

  it('returns true when all manual specimen types have containers and no CSV files exist', () => {
    const result = canProceedToReview(
      [
        makeSpecimenType({
          containers: [{ id: 'c1', quantity: 1, unitSymbol: 'spots' }],
        }),
      ],
      [],
    )
    expect(result).toBe(true)
  })

  it('returns true when no manual specimen types exist but CSV files are valid', () => {
    const result = canProceedToReview(
      [],
      [makeCsvFile()],
    )
    expect(result).toBe(true)
  })

  it('returns true when both manual and CSV sources are valid', () => {
    const result = canProceedToReview(
      [
        makeSpecimenType({
          containers: [{ id: 'c1', quantity: 1, unitSymbol: 'spots' }],
        }),
      ],
      [makeCsvFile()],
    )
    expect(result).toBe(true)
  })

  it('returns false when manual is valid but CSV file is missing collection', () => {
    const result = canProceedToReview(
      [
        makeSpecimenType({
          containers: [{ id: 'c1', quantity: 1, unitSymbol: 'spots' }],
        }),
      ],
      [makeCsvFile({ collectionId: undefined, collectionName: undefined })],
    )
    expect(result).toBe(false)
  })

  it('returns false when CSV is valid but manual specimen types have no containers', () => {
    const result = canProceedToReview(
      [makeSpecimenType({ containers: [] })],
      [makeCsvFile()],
    )
    expect(result).toBe(false)
  })

  it('returns false when neither manual nor CSV data exists', () => {
    const result = canProceedToReview([], [])
    expect(result).toBe(false)
  })

  it('returns false when CSV paper file is missing sheet name', () => {
    const result = canProceedToReview(
      [],
      [makeCsvFile({
        containerType: 'paper',
        sheetName: undefined,
        rows: [{ specimen_type_name: 'DBS' }],
      })],
    )
    expect(result).toBe(false)
  })

  it('returns true when CSV paper file has sheet name', () => {
    const result = canProceedToReview(
      [],
      [makeCsvFile({
        containerType: 'paper',
        sheetName: 'Sheet A',
        rows: [{ specimen_type_name: 'DBS' }],
      })],
    )
    expect(result).toBe(true)
  })
})
