import { describe, expect, it } from 'bun:test'
import { migrateExportConfigurationColumnKeys } from '../export-config-migration'

describe('migrateExportConfigurationColumnKeys', () => {
  it('rewrites state to tags in configuration columns', () => {
    const { configs, changed } = migrateExportConfigurationColumnKeys({
      configurations: [
        {
          name: 'Default',
          columns: ['barcode', 'state', 'status'],
          isDefault: true,
        },
      ],
    })

    expect(changed).toBe(true)
    expect(configs.configurations[0].columns).toEqual(['barcode', 'sublabel', 'tags', 'status'])
  })

  it('rewrites label to sheet_name in configuration columns', () => {
    const { configs, changed } = migrateExportConfigurationColumnKeys({
      configurations: [
        {
          name: 'Paper export',
          columns: ['barcode', 'label', 'status'],
          isDefault: false,
        },
      ],
    })

    expect(changed).toBe(true)
    expect(configs.configurations[0].columns).toEqual(['barcode', 'sheet_name', 'sublabel', 'status'])
  })

  it('is idempotent on second run', () => {
    const first = migrateExportConfigurationColumnKeys({
      configurations: [{ name: 'Default', columns: ['state'] }],
    })
    const second = migrateExportConfigurationColumnKeys(first.configs)

    expect(second.changed).toBe(false)
    expect(second.configs.configurations[0].columns).toEqual(['tags'])
  })

  it('appends sublabel after sheet_name when paper context columns are present', () => {
    const { configs, changed } = migrateExportConfigurationColumnKeys({
      configurations: [
        {
          name: 'Mixed export',
          columns: ['barcode', 'sheet_name', 'status'],
          isDefault: true,
        },
      ],
    })

    expect(changed).toBe(true)
    expect(configs.configurations[0].columns).toEqual(['barcode', 'sheet_name', 'sublabel', 'status'])
  })

  it('does not duplicate sublabel when already present', () => {
    const { configs, changed } = migrateExportConfigurationColumnKeys({
      configurations: [
        {
          name: 'Already migrated',
          columns: ['barcode', 'sublabel', 'sheet_name'],
          isDefault: false,
        },
      ],
    })

    expect(changed).toBe(false)
    expect(configs.configurations[0].columns).toEqual(['barcode', 'sublabel', 'sheet_name'])
  })
})
