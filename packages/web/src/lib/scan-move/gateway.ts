import { collectionsApi } from '../api/collections'
import type { ScanMoveContainerInfo, ScanMoveGateway, ScanMoveVariant } from './types'

/** Production gateway: adapts collectionsApi to the scan move port. */
export function createCollectionsScanMoveGateway(variant: ScanMoveVariant): ScanMoveGateway {
  return {
    async resolveContainers(identifiers) {
      const response = await collectionsApi.resolveContainers({ identifiers })
      return {
        containers: response.containers.map((entry) => ({
          identifier: entry.identifier,
          container: (entry.container as ScanMoveContainerInfo | null | undefined) ?? null,
        })),
      }
    },

    moveContainers(request) {
      return collectionsApi.moveContainers(request)
    },

    async getDestinationWells(collectionId) {
      const response = await collectionsApi.getMicronixPlate(collectionId)
      return response.wells
    },

    async createDestination(input) {
      if (variant.collectionType === 'micronix_plate') {
        await collectionsApi.createMicronixPlate(input)
      } else {
        await collectionsApi.createCryovialBox(input)
      }
    },
  }
}
