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
    expect(configs.configurations[0].columns).toEqual(['barcode', 'tags', 'status'])
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
    expect(configs.configurations[0].columns).toEqual(['barcode', 'sheet_name', 'status'])
  })

  it('is idempotent on second run', () => {
    const first = migrateExportConfigurationColumnKeys({
      configurations: [{ name: 'Default', columns: ['state'] }],
    })
    const second = migrateExportConfigurationColumnKeys(first.configs)

    expect(second.changed).toBe(false)
    expect(second.configs.configurations[0].columns).toEqual(['tags'])
  })
})
