import type { DerivationsBulkGateway } from '../types'

export function stubGateway(overrides: Partial<DerivationsBulkGateway> = {}): DerivationsBulkGateway {
  return {
    validateCsv: () =>
      Promise.resolve({
        rows: [],
        collections: [],
        summary: { total: 0, valid: 0, invalid: 0, warnings: 0 },
      }),
    importCsv: () => Promise.resolve({ rows: [] }),
    createMicronixPlate: () => Promise.resolve(),
    createCryovialBox: () => Promise.resolve(),
    ...overrides,
  }
}
