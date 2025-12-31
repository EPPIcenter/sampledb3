import type { SpecimenType } from '../../db/schema'

export const testSpecimenType1: Omit<SpecimenType, 'id'> = {
  name: 'Whole Blood',
  created: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
}

export const testSpecimenType2: Omit<SpecimenType, 'id'> = {
  name: 'Plasma',
  created: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
}



