import { collectionsApi } from '../api/collections'
import { derivationsApi } from '../api/derivations'
import { getQueryErrorMessage } from '../../ui'
import type { DerivationsBulkGateway } from './types'

/** Production gateway: derivations + collections HTTP adapters. */
export function createDerivationsBulkGateway(): DerivationsBulkGateway {
  return {
    async validateCsv(csvContent, settings) {
      try {
        return await derivationsApi.validateCsv(csvContent, settings)
      } catch (error: unknown) {
        throw new Error(getQueryErrorMessage(error, 'Failed to validate CSV'))
      }
    },
    async importCsv(csvContent, settings) {
      try {
        return await derivationsApi.importCsv(csvContent, { dryRun: false, settings })
      } catch (error: unknown) {
        throw new Error(getQueryErrorMessage(error, 'Failed to import derivations'))
      }
    },
    createMicronixPlate(input) {
      return collectionsApi.createMicronixPlate(input)
    },
    createCryovialBox(input) {
      return collectionsApi.createCryovialBox(input)
    },
  }
}
