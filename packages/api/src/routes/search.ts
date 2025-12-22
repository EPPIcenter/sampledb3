import { Hono } from 'hono'
import { db } from '../db/client'
import { specimen, study, studySubject, micronixTube, cryovialTube, micronixPlate, cryovialBox, box, bag, location, controlBatch, controlDefinition } from '../db/schema'
import { eq, or, like, sql } from 'drizzle-orm'

const search = new Hono()

// Unified search endpoint
search.get('/', async (c) => {
  try {
    const query = c.req.query('q')
    const type = c.req.query('type') // 'specimen', 'container', 'study', 'subject', or 'all'
    
    if (!query || query.length < 1) {
      return c.json({ results: [] })
    }

    const results: any[] = []
    const searchTypes = type ? [type] : ['specimen', 'container', 'study', 'subject']
    
    // Helper to build location path string
    function buildLocationPath(loc: any | null): string | undefined {
      if (!loc) return undefined
      const parts = [loc.locationRoot, loc.levelI, loc.levelII]
      if (loc.levelIII) parts.push(loc.levelIII)
      return parts.filter(Boolean).join(' → ')
    }

    // Search specimens by ID or source info
    if (searchTypes.includes('specimen') || searchTypes.includes('all')) {
      const queryNum = parseInt(query)
      if (!isNaN(queryNum)) {
        const specimens = await db
          .select({
            id: specimen.id,
            studySubjectId: specimen.studySubjectId,
            controlBatchId: specimen.controlBatchId,
            collectionDate: specimen.collectionDate,
            type: sql<string>`'specimen'`.as('type'),
          })
          .from(specimen)
          .where(eq(specimen.id, queryNum))
          .limit(10)
        
        for (const spec of specimens) {
          const sourceInfo = spec.studySubjectId ? `Subject #${spec.studySubjectId}` : spec.controlBatchId ? `Control Batch #${spec.controlBatchId}` : 'N/A'
          results.push({
            type: 'specimen',
            id: spec.id,
            title: `Specimen #${spec.id}`,
            subtitle: `Source: ${sourceInfo}`,
            url: `/specimens/${spec.id}`,
            data: spec,
          })
        }
      }
    }

    // Search containers by barcode (micronix, cryovial, etc.)
    if (searchTypes.includes('container') || searchTypes.includes('all')) {
      // Search micronix tubes by barcode
      const micronixTubes = await db
        .select({
          id: micronixTube.id,
          barcode: micronixTube.barcode,
          position: micronixTube.position,
          plateId: micronixTube.manifestId,
          plateName: micronixPlate.name,
          type: sql<string>`'micronix_tube'`.as('type'),
        })
        .from(micronixTube)
        .leftJoin(micronixPlate, eq(micronixTube.manifestId, micronixPlate.id))
        .where(like(micronixTube.barcode, `%${query}%`))
        .limit(10)
      
      for (const tube of micronixTubes) {
        results.push({
          type: 'container',
          id: tube.id,
          title: `Micronix Tube: ${tube.barcode}`,
          subtitle: `Plate: ${tube.plateName || tube.plateId}, Position: ${tube.position || 'N/A'}`,
          url: `/containers/${tube.id}`,
          data: tube,
        })
      }

      // Search cryovial tubes by barcode
      const cryovialTubes = await db
        .select({
          id: cryovialTube.id,
          barcode: cryovialTube.barcode,
          position: cryovialTube.position,
          boxId: cryovialTube.manifestId,
          boxName: cryovialBox.name,
          type: sql<string>`'cryovial_tube'`.as('type'),
        })
        .from(cryovialTube)
        .leftJoin(cryovialBox, eq(cryovialTube.manifestId, cryovialBox.id))
        .where(like(cryovialTube.barcode, `%${query}%`))
        .limit(10)
      
      for (const tube of cryovialTubes) {
        results.push({
          type: 'container',
          id: tube.id,
          title: `Cryovial Tube: ${tube.barcode || 'No barcode'}`,
          subtitle: `Box: ${tube.boxName || tube.boxId}, Position: ${tube.position || 'N/A'}`,
          url: `/containers/${tube.id}`,
          data: tube,
        })
      }

      // Search by container ID (try micronix and cryovial directly)
      const queryNum = parseInt(query)
      if (!isNaN(queryNum)) {
        // Check if it's a micronix tube ID
        const micronixById = await db
          .select()
          .from(micronixTube)
          .where(eq(micronixTube.id, queryNum))
          .limit(1)
        
        if (micronixById.length > 0) {
          const tube = micronixById[0]
          results.push({
            type: 'container',
            id: tube.id,
            title: `Micronix Tube #${tube.id}`,
            subtitle: tube.barcode ? `Barcode: ${tube.barcode}` : `Plate: ${tube.manifestId}`,
            url: `/containers/${tube.id}`,
            data: tube,
          })
        } else {
          // Check if it's a cryovial tube ID
          const cryovialById = await db
            .select()
            .from(cryovialTube)
            .where(eq(cryovialTube.id, queryNum))
            .limit(1)
          
          if (cryovialById.length > 0) {
            const tube = cryovialById[0]
            results.push({
              type: 'container',
              id: tube.id,
              title: `Cryovial Tube #${tube.id}`,
              subtitle: tube.barcode ? `Barcode: ${tube.barcode}` : `Box: ${tube.manifestId}`,
              url: `/containers/${tube.id}`,
              data: tube,
            })
          }
        }
      }
    }

    // Search studies by code or title
    if (searchTypes.includes('study') || searchTypes.includes('all')) {
      const studies = await db
        .select()
        .from(study)
        .where(
          or(
            like(study.shortCode, `%${query}%`),
            like(study.title, `%${query}%`)
          )!
        )
        .limit(10)
      
      for (const studyRecord of studies) {
        results.push({
          type: 'study',
          id: studyRecord.id,
          title: studyRecord.title,
          subtitle: `Code: ${studyRecord.shortCode}`,
          url: `/studies/${studyRecord.id}`,
          data: studyRecord,
        })
      }
    }

    // Search subjects by name
    if (searchTypes.includes('subject') || searchTypes.includes('all')) {
      const subjects = await db
        .select()
        .from(studySubject)
        .where(like(studySubject.name, `%${query}%`))
        .limit(10)
      
      for (const subject of subjects) {
        results.push({
          type: 'subject',
          id: subject.id,
          title: subject.name,
          subtitle: `Study ID: ${subject.studyId}`,
          url: `/subjects/${subject.id}`,
          data: subject,
        })
      }
    }

    // Search collections (micronix plates, cryovial boxes, boxes, bags, dbs bags)
    if (searchTypes.includes('collection') || searchTypes.includes('all')) {
      const queryNum = parseInt(query)
      const isNumeric = !isNaN(queryNum)

      // Search micronix plates by name or barcode
      const micronixPlates = await db
        .select({
          id: micronixPlate.id,
          name: micronixPlate.name,
          barcode: micronixPlate.barcode,
          locationId: micronixPlate.locationId,
          locationRoot: location.locationRoot,
          levelI: location.levelI,
          levelII: location.levelII,
          levelIII: location.levelIII,
        })
        .from(micronixPlate)
        .leftJoin(location, eq(micronixPlate.locationId, location.id))
        .where(
          isNumeric
            ? eq(micronixPlate.id, queryNum)
            : or(
                like(micronixPlate.name, `%${query}%`),
                like(micronixPlate.barcode, `%${query}%`)
              )!
        )
        .limit(10)

      for (const plate of micronixPlates) {
        const loc = plate.locationRoot ? {
          locationRoot: plate.locationRoot,
          levelI: plate.levelI,
          levelII: plate.levelII,
          levelIII: plate.levelIII,
        } : null
        const locationPath = buildLocationPath(loc)
        const subtitle = [locationPath, plate.barcode].filter(Boolean).join(' • ')
        
        results.push({
          type: 'micronix_plate',
          id: plate.id,
          title: plate.name,
          subtitle: subtitle || 'No location',
          url: `/collections/micronix-plates/${plate.id}`,
          data: plate,
        })
      }

      // Search cryovial boxes by name or barcode
      const cryovialBoxes = await db
        .select({
          id: cryovialBox.id,
          name: cryovialBox.name,
          barcode: cryovialBox.barcode,
          locationId: cryovialBox.locationId,
          locationRoot: location.locationRoot,
          levelI: location.levelI,
          levelII: location.levelII,
          levelIII: location.levelIII,
        })
        .from(cryovialBox)
        .leftJoin(location, eq(cryovialBox.locationId, location.id))
        .where(
          isNumeric
            ? eq(cryovialBox.id, queryNum)
            : or(
                like(cryovialBox.name, `%${query}%`),
                like(cryovialBox.barcode, `%${query}%`)
              )!
        )
        .limit(10)

      for (const box of cryovialBoxes) {
        const loc = box.locationRoot ? {
          locationRoot: box.locationRoot,
          levelI: box.levelI,
          levelII: box.levelII,
          levelIII: box.levelIII,
        } : null
        const locationPath = buildLocationPath(loc)
        const subtitle = [locationPath, box.barcode].filter(Boolean).join(' • ')
        
        results.push({
          type: 'cryovial_box',
          id: box.id,
          title: box.name,
          subtitle: subtitle || 'No location',
          url: `/collections/cryovial-boxes/${box.id}`,
          data: box,
        })
      }

      // Search boxes by name
      const boxes = await db
        .select({
          id: box.id,
          name: box.name,
          locationId: box.locationId,
          locationRoot: location.locationRoot,
          levelI: location.levelI,
          levelII: location.levelII,
          levelIII: location.levelIII,
        })
        .from(box)
        .leftJoin(location, eq(box.locationId, location.id))
        .where(
          isNumeric
            ? eq(box.id, queryNum)
            : like(box.name, `%${query}%`)
        )
        .limit(10)

      for (const b of boxes) {
        const loc = b.locationRoot ? {
          locationRoot: b.locationRoot,
          levelI: b.levelI,
          levelII: b.levelII,
          levelIII: b.levelIII,
        } : null
        const locationPath = buildLocationPath(loc)
        
        results.push({
          type: 'box',
          id: b.id,
          title: b.name,
          subtitle: locationPath || 'No location',
          url: `/collections/boxes/${b.id}`,
          data: b,
        })
      }

      // Search bags by name
      const bags = await db
        .select({
          id: bag.id,
          name: bag.name,
          locationId: bag.locationId,
          locationRoot: location.locationRoot,
          levelI: location.levelI,
          levelII: location.levelII,
          levelIII: location.levelIII,
        })
        .from(bag)
        .leftJoin(location, eq(bag.locationId, location.id))
        .where(
          isNumeric
            ? eq(bag.id, queryNum)
            : like(bag.name, `%${query}%`)
        )
        .limit(10)

      for (const b of bags) {
        const loc = b.locationRoot ? {
          locationRoot: b.locationRoot,
          levelI: b.levelI,
          levelII: b.levelII,
          levelIII: b.levelIII,
        } : null
        const locationPath = buildLocationPath(loc)
        
        results.push({
          type: 'bag',
          id: b.id,
          title: b.name,
          subtitle: locationPath || 'No location',
          url: `/collections/bags/${b.id}`,
          data: b,
        })
      }

      // Search control batches by name
      const controlBatches = await db
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
            : or(
                like(controlBatch.name, `%${query}%`),
                like(controlDefinition.name, `%${query}%`)
              )!
        )
        .limit(10)

      for (const batch of controlBatches) {
        results.push({
          type: 'control_batch',
          id: batch.id,
          title: batch.name,
          subtitle: `Definition: ${batch.definitionName || 'N/A'}`,
          url: `/controls/batches/${batch.id}`,
          data: batch,
        })
      }
    }

    return c.json({ results, query, count: results.length })
  } catch (error: any) {
    console.error('Error in search:', error)
    return c.json({ error: 'Search failed', details: error.message }, 500)
  }
})

export default search
