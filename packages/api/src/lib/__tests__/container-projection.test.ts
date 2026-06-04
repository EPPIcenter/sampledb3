import { describe, expect, it } from 'bun:test'
import {
  mapCollectionInfoToWire,
  projectContainerCollection,
  projectContainerIdentity,
  projectContainerPlacementFields,
} from '../container-projection'
import type { ContainerPlacement } from '../container-placement'

describe('projectContainerCollection', () => {
  it('returns placement-only micronix collection without barcode', () => {
    const placement: ContainerPlacement = {
      containerType: 'micronix_tube',
      collection: { type: 'micronix_plate', id: 10, name: 'Plate1', position: 'A01' },
      location: null,
      parentCollection: null,
    }

    expect(projectContainerCollection(placement)).toEqual({
      type: 'micronix_plate',
      id: 10,
      name: 'Plate1',
      position: 'A01',
    })
  })

  it('returns sheet collection without position for paper', () => {
    const placement: ContainerPlacement = {
      containerType: 'paper',
      collection: { type: 'sheet', id: 143, name: '2058121' },
      location: null,
      parentCollection: null,
    }

    expect(projectContainerCollection(placement)).toEqual({
      type: 'sheet',
      id: 143,
      name: '2058121',
    })
  })
})

describe('projectContainerIdentity', () => {
  it('projects tube barcode from micronix subtype', () => {
    expect(
      projectContainerIdentity('micronix_tube', {
        micronix: { barcode: 'MTX-001', position: 'A01', plateId: 1, plateName: 'P', locationId: 1 },
      }),
    ).toEqual({ barcode: 'MTX-001' })
  })

  it('projects paper sublabel and sheet name', () => {
    expect(
      projectContainerIdentity('paper', {
        paper: { sublabel: 'Spot-1', sheetId: 1, sheetName: '2058121', boxId: 1, bagId: null },
      }),
    ).toEqual({ sublabel: 'Spot-1', sheetName: '2058121' })
  })

  it('omits sheet name when Unknown', () => {
    expect(
      projectContainerIdentity('paper', {
        paper: { sublabel: null, sheetId: 1, sheetName: 'Unknown', boxId: null, bagId: null },
      }),
    ).toEqual({})
  })
})

describe('projectContainerPlacementFields', () => {
  it('filters Unknown collection names from export fields', () => {
    const placement: ContainerPlacement = {
      containerType: 'cryovial_tube',
      collection: { type: 'cryovial_box', id: 5, name: 'Unknown', position: 'B02' },
      location: null,
      parentCollection: null,
    }

    expect(projectContainerPlacementFields(placement)).toEqual({
      collection: { type: 'cryovial_box', id: 5, name: 'Unknown', position: 'B02' },
      position: 'B02',
      collectionName: undefined,
    })
  })
})

describe('mapCollectionInfoToWire', () => {
  it('maps sheet without position', () => {
    expect(mapCollectionInfoToWire({ type: 'sheet', id: 1, name: 'S1' })).toEqual({
      type: 'sheet',
      id: 1,
      name: 'S1',
    })
  })
})
