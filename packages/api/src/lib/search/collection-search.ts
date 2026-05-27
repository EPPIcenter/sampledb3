import type { Database } from '../../db/client'
import {
  micronixPlate,
  cryovialBox,
  box,
  bag,
  location,
  controlBatch,
  controlDefinition,
} from '../../db/schema'
import { eq, or, like } from 'drizzle-orm'
import { formatLocationPath } from '../container-enrichment'
import type { SearchResult } from './types'

/** Search collections and control batches by name, barcode, or numeric id. */
export async function searchCollections(database: Database, query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const queryNum = parseInt(query)
  const isNumeric = !isNaN(queryNum)

  const micronixPlates = await database
    .select({
      id: micronixPlate.id,
      name: micronixPlate.name,
      barcode: micronixPlate.barcode,
      locationId: micronixPlate.locationId,
      locationPath: location.path,
      locationName: location.name,
    })
    .from(micronixPlate)
    .leftJoin(location, eq(micronixPlate.locationId, location.id))
    .where(
      isNumeric
        ? eq(micronixPlate.id, queryNum)
        : or(like(micronixPlate.name, `%${query}%`), like(micronixPlate.barcode, `%${query}%`))!,
    )
    .limit(10)

  for (const plate of micronixPlates) {
    const locationPath = formatLocationPath(plate)
    const subtitle = [locationPath, plate.barcode].filter(Boolean).join(' • ')

    results.push({
      type: 'micronix_plate',
      id: plate.id,
      title: plate.name,
      name: plate.name,
      barcode: plate.barcode,
      locationId: plate.locationId,
      locationPath: locationPath,
      subtitle: subtitle || 'No location',
      url: `/collections/micronix-plates/${plate.id}`,
      data: plate,
    })
  }

  const cryovialBoxes = await database
    .select({
      id: cryovialBox.id,
      name: cryovialBox.name,
      barcode: cryovialBox.barcode,
      locationId: cryovialBox.locationId,
      locationPath: location.path,
      locationName: location.name,
    })
    .from(cryovialBox)
    .leftJoin(location, eq(cryovialBox.locationId, location.id))
    .where(
      isNumeric
        ? eq(cryovialBox.id, queryNum)
        : or(like(cryovialBox.name, `%${query}%`), like(cryovialBox.barcode, `%${query}%`))!,
    )
    .limit(10)

  for (const cryoBox of cryovialBoxes) {
    const locationPath = formatLocationPath(cryoBox)
    const subtitle = [locationPath, cryoBox.barcode].filter(Boolean).join(' • ')

    results.push({
      type: 'cryovial_box',
      id: cryoBox.id,
      title: cryoBox.name,
      name: cryoBox.name,
      barcode: cryoBox.barcode,
      locationId: cryoBox.locationId,
      locationPath: locationPath,
      subtitle: subtitle || 'No location',
      url: `/collections/cryovial-boxes/${cryoBox.id}`,
      data: cryoBox,
    })
  }

  const boxes = await database
    .select({
      id: box.id,
      name: box.name,
      locationId: box.locationId,
      locationPath: location.path,
      locationName: location.name,
    })
    .from(box)
    .leftJoin(location, eq(box.locationId, location.id))
    .where(isNumeric ? eq(box.id, queryNum) : like(box.name, `%${query}%`))
    .limit(10)

  for (const paperBox of boxes) {
    const locationPath = formatLocationPath(paperBox)

    results.push({
      type: 'box',
      id: paperBox.id,
      title: paperBox.name,
      subtitle: locationPath || 'No location',
      url: `/collections/boxes/${paperBox.id}`,
      data: paperBox,
    })
  }

  const bags = await database
    .select({
      id: bag.id,
      name: bag.name,
      locationId: bag.locationId,
      locationPath: location.path,
      locationName: location.name,
    })
    .from(bag)
    .leftJoin(location, eq(bag.locationId, location.id))
    .where(isNumeric ? eq(bag.id, queryNum) : like(bag.name, `%${query}%`))
    .limit(10)

  for (const paperBag of bags) {
    const locationPath = formatLocationPath(paperBag)

    results.push({
      type: 'bag',
      id: paperBag.id,
      title: paperBag.name,
      subtitle: locationPath || 'No location',
      url: `/collections/bags/${paperBag.id}`,
      data: paperBag,
    })
  }

  const controlBatches = await database
    .select({
      id: controlBatch.id,
      name: controlBatch.name,
      definitionName: controlDefinition.name,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .where(
      isNumeric
        ? eq(controlBatch.id, queryNum)
        : or(like(controlBatch.name, `%${query}%`), like(controlDefinition.name, `%${query}%`))!,
    )
    .limit(10)

  for (const batch of controlBatches) {
    results.push({
      type: 'control_batch',
      id: batch.id,
      title: batch.name,
      subtitle: `Definition: ${batch.definitionName || 'N/A'}`,
      url: `/blood-controls/batches/${batch.id}`,
      data: batch,
    })
  }

  return results
}
