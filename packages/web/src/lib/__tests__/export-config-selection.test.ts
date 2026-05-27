import { describe, it, expect } from 'vitest'
import {
  formatExportConfigId,
  parseExportConfigId,
  findExportConfiguration,
  getExportColumnsForConfigId,
} from '../export-config-selection'

describe('formatExportConfigId / parseExportConfigId', () => {
  it('round-trips source and name', () => {
    const id = formatExportConfigId('personal', 'My Export: v2')
    expect(parseExportConfigId(id)).toEqual({
      source: 'personal',
      name: 'My Export: v2',
    })
  })

  it('returns null for empty id', () => {
    expect(parseExportConfigId('')).toBeNull()
  })

  it('returns null when colon is missing or at index 0', () => {
    expect(parseExportConfigId('personal')).toBeNull()
    expect(parseExportConfigId(':name')).toBeNull()
  })

  it('returns null when name is empty', () => {
    expect(parseExportConfigId('shared:')).toBeNull()
  })

  it('returns null for unknown source', () => {
    expect(parseExportConfigId('team:Default')).toBeNull()
  })
})

describe('findExportConfiguration', () => {
  const configs = [
    { source: 'shared' as const, name: 'Default', columns: ['barcode'] },
    { source: 'personal' as const, name: 'Minimal', columns: ['position'] },
  ]

  it('finds by composite id', () => {
    expect(findExportConfiguration(configs, 'personal:Minimal')?.columns).toEqual(['position'])
  })

  it('returns undefined for invalid id', () => {
    expect(findExportConfiguration(configs, '')).toBeUndefined()
    expect(findExportConfiguration(configs, 'bad-id')).toBeUndefined()
  })
})

describe('getExportColumnsForConfigId', () => {
  it('returns columns or undefined', () => {
    const configs = [{ source: 'shared' as const, name: 'A', columns: ['x'] }]
    expect(getExportColumnsForConfigId(configs, 'shared:A')).toEqual(['x'])
    expect(getExportColumnsForConfigId(configs, '')).toBeUndefined()
  })
})
