import type { Study } from '../../db/schema'

export const testStudy1: Omit<Study, 'id'> = {
  title: 'Test Study 1',
  description: 'A test study for unit testing',
  shortCode: 'TEST1',
  isLongitudinal: false,
  leadPerson: 'Dr. Test',
  created: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
}

export const testStudy2: Omit<Study, 'id'> = {
  title: 'Test Study 2',
  description: 'Another test study',
  shortCode: 'TEST2',
  isLongitudinal: true,
  leadPerson: 'Dr. Test',
  created: '2024-01-02T00:00:00.000Z',
  lastUpdated: '2024-01-02T00:00:00.000Z',
}



