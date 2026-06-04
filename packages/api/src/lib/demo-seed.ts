/**
 * Demo database seed - populates a database with sample data demonstrating
 * all SampleDB capabilities: studies, subjects, specimens, controls, derivations,
 * qPCR experiments, tags, and physical storage.
 *
 * CLI: bun run demo:seed (from packages/api) or bun packages/api/src/lib/demo-seed.ts (from root)
 * Requires DATABASE_PATH env var, or defaults to ./sampledb_demo.sqlite when run from root.
 */
import type { Database } from '../db/client'
import { openOperationalDatabase } from '../db/client'
import {
  users,
  specimenType,
  unit,
  storageType,
  location,
  study,
  containerTypeUnit,
  specimenTypeContainerType,
} from '../db/schema'
import { sql, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import {
  setContainerDefaults,
  setPaginationSettings,
  setPasswordRequirements,
  setSessionSettings,
  setExportConfigurations,
  setScannerConfigurations,
} from './settings'
import { runBulkCombinedImport } from './bulk-combined-import'
import { createBatchWithSpecimens } from './controls/batch-with-specimens'
import { createDerivation } from './derivations'
import { utcNow } from './datetime'
import { controlDefinition, box, sheet, micronixPlate, strain } from '../db/schema'

// Demo defaults (aligned with packages/web setup-defaults, inlined to avoid cross-package deps)
const DEMO_SPECIMEN_TYPES = [
  { name: 'Whole Blood', containerTypes: ['paper', 'cryovial_tube'] as const },
  { name: 'Plasma', containerTypes: ['cryovial_tube', 'micronix_tube'] as const },
  { name: 'DBS', containerTypes: ['paper', 'micronix_tube'] as const },
  { name: 'DNA (DBS)', containerTypes: ['micronix_tube'] as const },
]

const DEMO_UNITS = [
  { name: 'Milliliter', symbol: 'mL', category: 'volume' },
  { name: 'Microliter', symbol: 'µL', category: 'volume' },
  { name: 'Generic items', symbol: 'items', category: 'count' },
  { name: 'DBS spots', symbol: 'spots', category: 'count' },
  { name: 'Cryovial tubes', symbol: 'tubes', category: 'count' },
  { name: 'Parasites per microliter', symbol: 'p/uL', category: 'concentration' },
]

const DEMO_STORAGE_TYPES = [
  { name: 'Freezer -80°C', description: 'Ultra-low temperature freezer' },
  { name: 'Freezer -20°C', description: 'Standard freezer' },
]

export interface DemoSeedOptions {
  adminPassword?: string
}

export interface DemoSeedResult {
  usersCreated: number
  studiesCreated: number
  subjectsCreated: number
  specimensCreated: number
  containersCreated: number
  controlDefinitionsCreated: number
  controlBatchesCreated: number
  controlSpecimensCreated: number
}

export async function runDemoSeed(
  database: Database,
  options: DemoSeedOptions = {}
): Promise<DemoSeedResult> {
  const adminPassword = options.adminPassword ?? 'DemoAdmin1!'
  const now = utcNow()

  // Safety: refuse if already initialized
  const userCount = await database.select({ count: sql<number>`count(*)` }).from(users).get()
  if ((userCount?.count ?? 0) > 0) {
    throw new Error(
      'Database already initialized. Use a fresh database file or delete existing data first.'
    )
  }

  // 1. Create admin user
  const passwordHash = await bcrypt.hash(adminPassword, 10)
  await database.insert(users).values({
    id: 1,
    name: 'Demo Admin',
    email: 'admin@demo',
    username: 'admin',
    passwordHash,
    role: 'admin',
    createdAt: now,
    approvedAt: now,
  })

  // 2. Storage types
  const storageTypeMap = new Map<string, number>()
  for (let i = 0; i < DEMO_STORAGE_TYPES.length; i++) {
    const s = DEMO_STORAGE_TYPES[i]
    const result = await database
      .insert(storageType)
      .values({ id: i + 1, name: s.name, description: s.description })
      .returning()
    const row = Array.isArray(result) ? result[0] : result
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (!row) throw new Error('Insert did not return storage type row')
    storageTypeMap.set(s.name, row.id)
  }

  // 3. Specimen types
  for (const s of DEMO_SPECIMEN_TYPES) {
    await database
      .insert(specimenType)
      .values({ name: s.name, created: now, lastUpdated: now })
      .onConflictDoNothing()
  }

  // 4. Units
  await database.insert(unit).values(
    DEMO_UNITS.map((u) => ({ name: u.name, symbol: u.symbol, category: u.category }))
  ).onConflictDoNothing()

  // 5. Root locations
  const freezer80Id = storageTypeMap.get('Freezer -80°C')!
  await database.insert(location).values({
    id: 1,
    parentId: null,
    name: 'Freezer -80°C - Main',
    storageTypeId: String(freezer80Id),
    canContainCollections: false,
    path: 'Freezer -80°C - Main',
    created: now,
    lastUpdated: now,
  })

  // 6. Child location that can hold collections
  await database.insert(location).values({
    id: 2,
    parentId: 1,
    name: 'Shelf A',
    storageTypeId: null,
    canContainCollections: true,
    path: 'Freezer -80°C - Main / Shelf A',
    created: now,
    lastUpdated: now,
  })

  // 7. Container type / unit relationships
  const itemsUnit = await database.select().from(unit).where(eq(unit.symbol, 'items')).get()
  const spotsUnit = await database.select().from(unit).where(eq(unit.symbol, 'spots')).get()
  const tubesUnit = await database.select().from(unit).where(eq(unit.symbol, 'tubes')).get()
  const ulUnit = await database.select().from(unit).where(eq(unit.symbol, 'µL')).get()
  const mlUnit = await database.select().from(unit).where(eq(unit.symbol, 'mL')).get()
  const puLUnit = await database.select().from(unit).where(eq(unit.symbol, 'p/uL')).get()
  if (!itemsUnit || !spotsUnit || !tubesUnit || !ulUnit || !mlUnit || !puLUnit) {
    throw new Error('Required units not found after insert')
  }
  await database.insert(containerTypeUnit).values([
    { containerType: 'paper', unitId: spotsUnit.id },
    { containerType: 'cryovial_tube', unitId: itemsUnit.id },
    { containerType: 'cryovial_tube', unitId: tubesUnit.id },
    { containerType: 'cryovial_tube', unitId: ulUnit.id },
    { containerType: 'cryovial_tube', unitId: mlUnit.id },
    { containerType: 'micronix_tube', unitId: itemsUnit.id },
    { containerType: 'micronix_tube', unitId: ulUnit.id },
    { containerType: 'micronix_tube', unitId: mlUnit.id },
    { containerType: 'static_well', unitId: spotsUnit.id },
  ]).onConflictDoNothing()

  // 8. Specimen type / container type relationships
  const specimenTypeRows = await database.select().from(specimenType).all()
  const specimenTypeMap = new Map<string, number>()
  specimenTypeRows.forEach((st) => specimenTypeMap.set(st.name, st.id))
  for (const s of DEMO_SPECIMEN_TYPES) {
    const specimenTypeId = specimenTypeMap.get(s.name)
    if (specimenTypeId !== undefined) {
      for (const ct of s.containerTypes) {
        await database
          .insert(specimenTypeContainerType)
          .values({ specimenTypeId, containerType: ct })
          .onConflictDoNothing()
      }
    }
  }

  // 9. Default settings
  await setContainerDefaults(database, {
    micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
    cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
    paper: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'spots' },
    static_well: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'spots' },
  })
  await setPaginationSettings(database, { defaultPageSize: 50, maxPageSize: 1000 })
  await setPasswordRequirements(database, { minLength: 8 })
  await setSessionSettings(database, { maxAgeSeconds: 604800 })
  await setExportConfigurations(database, {
    configurations: [
      {
        name: 'All Columns',
        columns: [
          'container_id', 'container_type', 'barcode', 'position', 'label', 'collection_name',
          'status', 'comment', 'specimen_id', 'specimen_type', 'collection_date', 'subject_id',
          'subject_name', 'study_id', 'study_code', 'study_title', 'location_path', 'created', 'last_updated',
        ],
        isDefault: true,
      },
    ],
  })
  await setScannerConfigurations(database, {
    configurations: [
      { id: 'traxcer', name: 'Traxcer', barcodeColumn: 'Tube ID', positionType: 'single', positionColumn: 'Position', skipRows: 0, isDefault: true },
      { id: 'general', name: 'General', barcodeColumn: 'Barcode', positionType: 'combined', rowColumn: 'Row', columnColumn: 'Column', skipRows: 0 },
    ],
  })

  // 10. Strains for blood controls
  await database.insert(strain).values([
    { id: 1, name: 'W2', description: null },
    { id: 2, name: 'U659', description: null },
  ]).onConflictDoNothing()

  // 11. Create study DEMO01
  await database.insert(study).values({
    title: 'Demo Study',
    description: 'Sample study for demonstrating SampleDB capabilities',
    shortCode: 'DEMO01',
    isLongitudinal: true,
    leadPerson: 'Demo Lead',
    created: now,
    lastUpdated: now,
    createdBy: 1,
    updatedBy: 1,
  })

  // 12. Bulk import subjects + specimens with micronix tubes
  const shelfLocationId = 2
  const bulkResult = await runBulkCombinedImport(
    database,
    {
      studyShortCode: 'DEMO01',
      atomicMode: 'full_file',
      createCollections: [
        { type: 'micronix_plate', name: 'DEMO-PLATE-001', locationId: shelfLocationId },
      ],
      subjects: [
        { subjectName: 'DEMO-SUBJ-001', specimens: [{ specimenTypeName: 'DNA (DBS)', collectionDate: '2024-01-15', container: { containerType: 'micronix_tube', collectionName: 'DEMO-PLATE-001', barcode: 'DEMO8000001', position: 'A01', collectionLocationId: shelfLocationId } }] },
        { subjectName: 'DEMO-SUBJ-002', specimens: [{ specimenTypeName: 'DNA (DBS)', collectionDate: '2024-01-15', container: { containerType: 'micronix_tube', collectionName: 'DEMO-PLATE-001', barcode: 'DEMO8000002', position: 'A02', collectionLocationId: shelfLocationId } }] },
        { subjectName: 'DEMO-SUBJ-003', specimens: [{ specimenTypeName: 'DNA (DBS)', collectionDate: '2024-01-15', container: { containerType: 'micronix_tube', collectionName: 'DEMO-PLATE-001', barcode: 'DEMO8000003', position: 'A03', collectionLocationId: shelfLocationId } }] },
        { subjectName: 'DEMO-SUBJ-004', specimens: [{ specimenTypeName: 'DNA (DBS)', collectionDate: '2024-01-16', container: { containerType: 'micronix_tube', collectionName: 'DEMO-PLATE-001', barcode: 'DEMO8000004', position: 'A04', collectionLocationId: shelfLocationId } }] },
        { subjectName: 'DEMO-SUBJ-005', specimens: [{ specimenTypeName: 'DNA (DBS)', collectionDate: '2024-01-16', container: { containerType: 'micronix_tube', collectionName: 'DEMO-PLATE-001', barcode: 'DEMO8000005', position: 'A05', collectionLocationId: shelfLocationId } }] },
      ],
    },
    1 // userId
  )

  // 13. Control definitions and batches
  const negResult = await database.insert(controlDefinition).values({
    name: 'Demo Negative Control',
    controlType: 'negative',
    created: now,
    lastUpdated: now,
    createdBy: 1,
    updatedBy: 1,
  }).returning()
  const negDef = Array.isArray(negResult) ? negResult[0] : negResult
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
  if (!negDef) throw new Error('Insert did not return control definition row')
  const negDefId = negDef.id

  const plasmaPosResult = await database.insert(controlDefinition).values({
    name: 'Demo Plasma Positive',
    controlType: 'plasma_positive',
    created: now,
    lastUpdated: now,
    createdBy: 1,
    updatedBy: 1,
  }).returning()
  const plasmaPosDef = Array.isArray(plasmaPosResult) ? plasmaPosResult[0] : plasmaPosResult
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
  if (!plasmaPosDef) throw new Error('Insert did not return control definition row')
  const plasmaPosDefId = plasmaPosDef.id

  const bloodResult = await database.insert(controlDefinition).values({
    name: 'Demo Blood Control',
    controlType: 'blood',
    properties: {
      strains: [
        { id: 1, name: 'W2', percentage: 50 },
        { id: 2, name: 'U659', percentage: 50 },
      ],
      targetDensity: 10000,
      targetDensityUnitId: puLUnit.id,
      targetDensityUnitSymbol: 'p/uL',
    },
    created: now,
    lastUpdated: now,
    createdBy: 1,
    updatedBy: 1,
  }).returning()
  const bloodDef = Array.isArray(bloodResult) ? bloodResult[0] : bloodResult
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
  if (!bloodDef) throw new Error('Insert did not return control definition row')
  const bloodDefId = bloodDef.id

  const controlBatchResult1 = await createBatchWithSpecimens(database, {
    batch: { controlDefinitionId: negDefId, name: 'Demo Neg 2024-01', productionDate: '2024-01-01' },
    specimens: [{
      specimenTypeName: 'Plasma',
      collectionDate: '2024-01-01',
      containers: [{
        type: 'micronix_tube',
        collectionName: 'CTRL-PLATE-NEG',
        collectionLocationId: shelfLocationId,
        containerBarcode: 'CTRL9000001',
        position: 'A01',
      }],
    }],
    createCollections: [
      { type: 'micronix_plate', name: 'CTRL-PLATE-NEG', locationId: shelfLocationId },
    ],
  })

  const controlBatchResult2 = await createBatchWithSpecimens(database, {
    batch: { controlDefinitionId: plasmaPosDefId, name: 'Demo Plasma Pos 2024-01', productionDate: '2024-01-01' },
    specimens: [{
      specimenTypeName: 'Plasma',
      collectionDate: '2024-01-01',
      containers: [{
        type: 'micronix_tube',
        collectionName: 'CTRL-PLATE-POS',
        collectionLocationId: shelfLocationId,
        containerBarcode: 'CTRL9000002',
        position: 'A01',
      }],
    }],
    createCollections: [
      { type: 'micronix_plate', name: 'CTRL-PLATE-POS', locationId: shelfLocationId },
    ],
  })

  // One Whole Blood specimen (type+date+batch) with 2 aliquots in containers
  const controlBatchResult3 = await createBatchWithSpecimens(database, {
    batch: { controlDefinitionId: bloodDefId, name: 'Demo Blood 2024-01', productionDate: '2024-01-01' },
    specimens: [
      {
        specimenTypeName: 'Whole Blood',
        collectionDate: '2024-01-01',
        containers: [
          {
            type: 'cryovial_tube',
            collectionName: 'CTRL-BOX-BLOOD',
            collectionLocationId: shelfLocationId,
            containerBarcode: 'CTRL8000001',
            position: 'A01',
          },
          {
            type: 'cryovial_tube',
            collectionName: 'CTRL-BOX-BLOOD',
            collectionLocationId: shelfLocationId,
            containerBarcode: 'CTRL8000002',
            position: 'A02',
          },
        ],
      },
    ],
    createCollections: [
      { type: 'cryovial_box', name: 'CTRL-BOX-BLOOD', locationId: shelfLocationId },
    ],
  })

  // 14. Blood control derivations: Whole Blood -> DBS -> DNA (DBS)
  const dbsBoxResult = await database.insert(box).values({
    name: 'CTRL-BOX-DBS',
    locationId: shelfLocationId,
    created: now,
    lastUpdated: now,
  }).returning()
  const dbsBox = Array.isArray(dbsBoxResult) ? dbsBoxResult[0] : dbsBoxResult
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
  if (!dbsBox) throw new Error('Insert did not return box row')
  const dbsBoxId = dbsBox.id

  const dbsSheetResult = await database.insert(sheet).values({
    name: 'CTRL-SHEET-DBS',
    boxId: dbsBoxId,
    bagId: null,
    created: now,
    lastUpdated: now,
  }).returning()
  const dbsSheet = Array.isArray(dbsSheetResult) ? dbsSheetResult[0] : dbsSheetResult
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
  if (!dbsSheet) throw new Error('Insert did not return sheet row')
  const dbsSheetId = dbsSheet.id

  const bloodDnaPlateResult = await database.insert(micronixPlate).values({
    name: 'CTRL-PLATE-BLOOD-DNA',
    locationId: shelfLocationId,
    barcode: null,
    created: now,
    lastUpdated: now,
  }).returning()
  const bloodDnaPlate = Array.isArray(bloodDnaPlateResult) ? bloodDnaPlateResult[0] : bloodDnaPlateResult
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
  if (!bloodDnaPlate) throw new Error('Insert did not return plate row')
  const bloodDnaPlateId = bloodDnaPlate.id

  const bloodContainerIds = controlBatchResult3.specimens.flatMap((s) => s.containerIds)
  const dbsContainerIds: number[] = []

  for (let i = 0; i < bloodContainerIds.length; i++) {
    const bloodContainerId = bloodContainerIds[i]
    const dbsResult = await createDerivation(database, {
      parentContainerId: bloodContainerId,
      derivationType: 'spot',
      specimenTypeName: 'DBS',
      containerType: 'paper',
      collectionId: dbsSheetId,
      sublabel: `CTRL-DBS-${String(i + 1).padStart(3, '0')}`,
      derivationDate: '2024-01-02',
      reduceParentQuantity: false,
    })
    dbsContainerIds.push(dbsResult.childContainer.id)
  }

  for (let i = 0; i < dbsContainerIds.length; i++) {
    await createDerivation(database, {
      parentContainerId: dbsContainerIds[i],
      derivationType: 'extraction',
      specimenTypeName: 'DNA (DBS)',
      containerType: 'micronix_tube',
      collectionId: bloodDnaPlateId,
      containerBarcode: `CTRL-DNA-${String(i + 1).padStart(3, '0')}`,
      position: i === 0 ? 'A01' : 'A02',
      derivationDate: '2024-01-03',
      reduceParentQuantity: false,
    })
  }

  const controlSpecimenCount =
    controlBatchResult1.specimens.reduce((s, sp) => s + sp.containerCount, 0) +
    controlBatchResult2.specimens.reduce((s, sp) => s + sp.containerCount, 0) +
    controlBatchResult3.specimens.reduce((s, sp) => s + sp.containerCount, 0)

  return {
    usersCreated: 1,
    studiesCreated: 1,
    subjectsCreated: bulkResult.summary.subjectsCreated,
    specimensCreated: bulkResult.summary.specimensCreated,
    containersCreated: bulkResult.summary.containersCreated,
    controlDefinitionsCreated: 3,
    controlBatchesCreated: 3,
    controlSpecimensCreated: controlSpecimenCount,
  }
}

if (import.meta.main) {
  const dbPath = process.env.DATABASE_PATH || './sampledb_demo.sqlite'
  const { db } = openOperationalDatabase(dbPath)
  runDemoSeed(db)
    .then((result) => {
      console.log('Demo seed complete:', result)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Demo seed failed:', err)
      process.exit(1)
    })
}
