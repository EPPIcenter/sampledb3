import { describe, expect, it } from 'bun:test'
import type { ContainerExportData } from '../export'

describe('export contract types', () => {
  it('accepts a representative container export row with tags', () => {
    const row: ContainerExportData = {
      container_id: 1,
      container_type: 'micronix_tube',
      tags: 'Hold, QC',
      status: 'In Use',
      specimen_id: 10,
      specimen_type: 'Blood',
      created: '2024-01-01T00:00:00Z',
      last_updated: '2024-01-02T00:00:00Z',
    }

    expect(row.tags).toBe('Hold, QC')
    expect('state' in row).toBe(false)
  })
})
