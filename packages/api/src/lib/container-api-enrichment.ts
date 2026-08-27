import type { Database } from '../db/client'
import type { Location, StorageContainer, Unit } from '../db/schema'
import type {
  CryovialSubtypeDetails,
  MicronixSubtypeDetails,
  PaperSubtypeDetails,
  StaticWellSubtypeDetails,
} from './container-placement'
import { loadContainerReadViews, type ContainerReadView } from './container-read-view'
import type { CollectionInfo } from '../types/collections'

export type EnrichedContainerApi = StorageContainer & {
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well' | 'unknown'
  tags: Array<{ id: number; name: string }>
  unit: Unit | undefined
  location: Location | null
  locationPath: string
  collection: CollectionInfo | null
  micronixTube?: MicronixSubtypeDetails
  cryovialTube?: CryovialSubtypeDetails
  paper?: PaperSubtypeDetails
  staticWell?: StaticWellSubtypeDetails
}

export function toEnrichedContainerApi(view: ContainerReadView): EnrichedContainerApi {
  return {
    ...view.container,
    containerType: view.containerType,
    tags: view.tags,
    unit: view.unit,
    location: view.location,
    locationPath: view.locationPath,
    collection: view.collection,
    micronixTube: view.micronixTube,
    cryovialTube: view.cryovialTube,
    paper: view.paper,
    staticWell: view.staticWell,
  }
}

/** Batch-enrich storage containers for API responses from the Container read view. */
export async function enrichContainersForApi(
  database: Database,
  containers: StorageContainer[],
): Promise<EnrichedContainerApi[]> {
  const views = await loadContainerReadViews(database, containers)
  return views.map(toEnrichedContainerApi)
}

export async function enrichContainerForApi(
  database: Database,
  container: StorageContainer,
): Promise<EnrichedContainerApi> {
  const [enriched] = await enrichContainersForApi(database, [container])
  return enriched
}
