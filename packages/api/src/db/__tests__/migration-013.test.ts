import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { applyInitialSchema } from '../apply-initial-schema'
import { CURRENT_SCHEMA_VERSION, evolveOperationalSchema, getRecordedSchemaVersion } from '../schema-evolution'

/**
 * Migration 013 applies the lab's legacy data cleanup decisions (issues #124 and #126). Each test
 * builds a database in production's version-12 shape: the current snapshot, without the indexes
 * production lacks, seeded with the production ids each decision names.
 */

const NOW = '2024-01-01 00:00:00'

function databaseAtVersion12(): Database {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  applyInitialSchema(sqlite)
  sqlite.exec('UPDATE schema_version SET version = 12')
  // Production has neither index: no Specimen identity index (decision 7), and migration 013
  // adds the Subject name one.
  sqlite.exec('DROP INDEX IF EXISTS idx_specimen_study_subject_type_date')
  sqlite.exec('DROP INDEX IF EXISTS study_subject_study_name_nocase_idx')
  sqlite.exec(`INSERT INTO study (id, title, short_code, is_longitudinal, lead_person, created, last_updated) VALUES
    (3, 'Controls', 'CTRL', 0, 'Lab', '${NOW}', '${NOW}'), (8, 'Jiangsu', 'JIANGSU17', 0, 'Lab', '${NOW}', '${NOW}')`)
  sqlite.exec(`INSERT INTO specimen_type (id, name, created, last_updated) VALUES (2, 'DBS', '${NOW}', '${NOW}'), (21, 'WB', '${NOW}', '${NOW}')`)
  sqlite.exec(`INSERT INTO unit (id, symbol, name, category) VALUES (5, 'uL', 'microliter', 'volume')`)
  sqlite.exec(`INSERT INTO storage_type (id, name) VALUES (1, 'Freezer')`)
  sqlite.exec(`INSERT INTO location (id, name, storage_type_id) VALUES (107, 'Freezer A', 1)`)
  sqlite.exec(`INSERT INTO cryovial_box (id, location_id, name, created, last_updated) VALUES (900, 107, 'Box 900', '${NOW}', '${NOW}')`)
  return sqlite
}

function addSubject(sqlite: Database, id: number, studyId: number, name: string): void {
  sqlite.prepare(`INSERT INTO study_subject (id, study_id, name, created, last_updated) VALUES (?, ?, ?, ?, ?)`).run(id, studyId, name, NOW, NOW)
}

function addSpecimen(sqlite: Database, id: number, subjectId: number, typeId: number, date: string | null): void {
  sqlite
    .prepare(`INSERT INTO specimen (id, study_subject_id, specimen_type_id, collection_date, created, last_updated) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, subjectId, typeId, date, NOW, NOW)
}

function addContainer(sqlite: Database, id: number, specimenId: number, options: { comment?: string; remaining?: number } = {}): void {
  sqlite
    .prepare(`INSERT INTO storage_container (id, specimen_id, comment, total_quantity, remaining_quantity, unit_id, created, last_updated) VALUES (?, ?, ?, 1.0, ?, 5, ?, ?)`)
    .run(id, specimenId, options.comment ?? null, options.remaining ?? 1.0, NOW, NOW)
}

function addCryovialTube(sqlite: Database, id: number, barcode: string | null): void {
  sqlite.prepare(`INSERT INTO cryovial_tube (id, collection_id, barcode) VALUES (?, 900, ?)`).run(id, barcode)
}

function addMicronixTube(sqlite: Database, id: number, plateId: number, barcode: string): void {
  sqlite.prepare(`INSERT INTO micronix_tube (id, collection_id, barcode) VALUES (?, ?, ?)`).run(id, plateId, barcode)
}

/** Production's rows for every decision, plus neighbours each step must leave alone. */
function seedProductionRows(sqlite: Database): void {
  addSubject(sqlite, 31047, 3, '3d7_0.05')
  addSubject(sqlite, 66537, 3, '3D7_0.05')
  addSubject(sqlite, 31049, 3, '3d7_10k')
  addSubject(sqlite, 66543, 3, '3D7_10K')
  addSubject(sqlite, 25613, 8, 'JS087')
  addSubject(sqlite, 500, 8, 'S500')

  // Decision 6: Specimen 43644 has no match on the target and moves to it; Specimen 43645
  // matches target Specimen 120524 (same type and date) and is merged into it.
  addSpecimen(sqlite, 43644, 31047, 21, '2018-03-15')
  addSpecimen(sqlite, 43645, 31047, 2, '2021-06-07')
  addSpecimen(sqlite, 120523, 66537, 2, '2021-06-08')
  addSpecimen(sqlite, 120524, 66537, 2, '2021-06-07')
  addSpecimen(sqlite, 43646, 31049, 21, '2018-03-15')
  addSpecimen(sqlite, 120529, 66543, 2, '2021-06-07')
  addContainer(sqlite, 70001, 43644)
  addContainer(sqlite, 70002, 43645)
  addContainer(sqlite, 70003, 43645)
  addContainer(sqlite, 70004, 120524)
  addContainer(sqlite, 70005, 43646)

  // Decision 1: placeholder dates, and dates that stay (including a future one, decision 2).
  addSpecimen(sqlite, 1, 500, 2, '1970-01-01')
  addSpecimen(sqlite, 2, 500, 2, '1999-09-09')
  addSpecimen(sqlite, 3, 500, 2, '1899-12-30')
  addSpecimen(sqlite, 4, 500, 2, '1111-01-01')
  addSpecimen(sqlite, 5, 500, 2, '1970-01-02')
  addSpecimen(sqlite, 6, 500, 2, '2073-02-08')
  addSpecimen(sqlite, 7, 500, 21, '1970-01-01')

  // Decision 3: exhausted Containers with remaining 1, and ones that stay.
  addSpecimen(sqlite, 10, 500, 21, '2020-01-01')
  addContainer(sqlite, 50465, 10, { comment: 'exhausted' })
  addContainer(sqlite, 124552, 10, { comment: 'Z32592; exhausted' })
  addContainer(sqlite, 143335, 10, { comment: 'Z20759; Zymo cleaned; exhausted' })
  addContainer(sqlite, 74034, 10, { comment: 'Reuploaded & Set to Exhausted', remaining: 0 })
  addContainer(sqlite, 74035, 10, { comment: 'half used', remaining: 0.5 })

  // Decision 4: placeholder tube barcodes, and real barcodes that contain NA.
  for (const [id, barcode] of [
    [80001, 'NA'],
    [80002, 'N/A'],
    [80003, 'n/a'],
    [80004, ' NA '],
    [80005, 'NA98'],
    [80006, 'DFNA'],
    [80007, null],
  ] as const) {
    addContainer(sqlite, id, 10)
    addCryovialTube(sqlite, id, barcode)
  }

  // Decision 5: Container 34513 has no tube or Paper row; its Specimen keeps its other Container.
  addSpecimen(sqlite, 31863, 25613, 21, '2018-07-24')
  addContainer(sqlite, 34513, 31863)
  addContainer(sqlite, 34514, 31863)
  addCryovialTube(sqlite, 34514, 'JS087-1')

  // Decision 8: plate 1760 is empty; plate 1761 keeps its tubes.
  sqlite.exec(`INSERT INTO micronix_plate (id, location_id, name, created, last_updated) VALUES
    (1760, 107, 'EXVIVO-27 ', '${NOW}', '${NOW}'), (1761, 107, 'EXVIVO-27', '${NOW}', '${NOW}')`)
  addContainer(sqlite, 90001, 10)
  addMicronixTube(sqlite, 90001, 1761, '1000000001')
}

function column<T>(sqlite: Database, sql: string): T[] {
  return (sqlite.prepare(sql).all() as Array<Record<string, T>>).map((row) => Object.values(row)[0] as T)
}

function rows(sqlite: Database, sql: string): unknown[] {
  return sqlite.prepare(sql).all()
}

describe('migration 013: legacy data cleanup', () => {
  let sqlite: Database

  beforeEach(() => {
    sqlite = databaseAtVersion12()
  })

  afterEach(() => {
    sqlite.close()
  })

  it('applies each decision to the rows it names and leaves every other row alone', () => {
    seedProductionRows(sqlite)

    evolveOperationalSchema(sqlite)

    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    // Decision 1
    expect(rows(sqlite, 'SELECT id, collection_date FROM specimen WHERE id <= 7 ORDER BY id')).toEqual([
      { id: 1, collection_date: null },
      { id: 2, collection_date: null },
      { id: 3, collection_date: null },
      { id: 4, collection_date: null },
      { id: 5, collection_date: '1970-01-02' },
      { id: 6, collection_date: '2073-02-08' },
      { id: 7, collection_date: null },
    ])
    // Decision 3
    expect(rows(sqlite, 'SELECT id, comment, remaining_quantity FROM storage_container WHERE specimen_id = 10 AND comment IS NOT NULL ORDER BY id')).toEqual([
      { id: 50465, comment: 'exhausted', remaining_quantity: 0 },
      { id: 74034, comment: 'Reuploaded & Set to Exhausted', remaining_quantity: 0 },
      { id: 74035, comment: 'half used', remaining_quantity: 0.5 },
      { id: 124552, comment: 'Z32592; exhausted', remaining_quantity: 0 },
      { id: 143335, comment: 'Z20759; Zymo cleaned; exhausted', remaining_quantity: 0 },
    ])
    // Decision 4
    expect(rows(sqlite, 'SELECT id, barcode FROM cryovial_tube WHERE id BETWEEN 80001 AND 80007 ORDER BY id')).toEqual([
      { id: 80001, barcode: null },
      { id: 80002, barcode: null },
      { id: 80003, barcode: null },
      { id: 80004, barcode: null },
      { id: 80005, barcode: 'NA98' },
      { id: 80006, barcode: 'DFNA' },
      { id: 80007, barcode: null },
    ])
    // Decision 5
    expect(column(sqlite, 'SELECT id FROM storage_container WHERE specimen_id = 31863')).toEqual([34514])
    // Decision 8
    expect(column(sqlite, `SELECT id FROM micronix_plate WHERE trim(name) = 'EXVIVO-27'`)).toEqual([1761])
    expect(column(sqlite, 'SELECT COUNT(*) FROM micronix_tube WHERE collection_id = 1761')).toEqual([1])
    // Decision 6: the app's Subject merge, run for both pairs.
    expect(rows(sqlite, 'SELECT id, name FROM study_subject WHERE study_id = 3 ORDER BY id')).toEqual([
      { id: 66537, name: '3D7_0.05' },
      { id: 66543, name: '3D7_10K' },
    ])
    expect(rows(sqlite, 'SELECT id, study_subject_id FROM specimen WHERE id IN (43644, 43645, 43646, 120523, 120524, 120529) ORDER BY id')).toEqual([
      { id: 43644, study_subject_id: 66537 },
      { id: 43646, study_subject_id: 66543 },
      { id: 120523, study_subject_id: 66537 },
      { id: 120524, study_subject_id: 66537 },
      { id: 120529, study_subject_id: 66543 },
    ])
    expect(rows(sqlite, 'SELECT id, specimen_id FROM storage_container WHERE id BETWEEN 70001 AND 70005 ORDER BY id')).toEqual([
      { id: 70001, specimen_id: 43644 },
      { id: 70002, specimen_id: 120524 },
      { id: 70003, specimen_id: 120524 },
      { id: 70004, specimen_id: 120524 },
      { id: 70005, specimen_id: 43646 },
    ])
    expect(column(sqlite, 'SELECT last_updated FROM study_subject WHERE id IN (66537, 66543)').every((t) => t !== NOW)).toBe(true)
    expect(column(sqlite, 'SELECT last_updated FROM specimen WHERE id = 43644')).not.toEqual([NOW])
    expect(column(sqlite, 'SELECT last_updated FROM storage_container WHERE id = 70002')).not.toEqual([NOW])
    expect(column(sqlite, `SELECT name FROM sqlite_temp_master WHERE name LIKE '__migration_013%'`)).toEqual([])
    expect(column(sqlite, 'PRAGMA foreign_key_check')).toEqual([])
  })

  it('adds a case-insensitive unique index on Subject name within a Study', () => {
    seedProductionRows(sqlite)

    evolveOperationalSchema(sqlite)

    expect(() => addSubject(sqlite, 1, 3, '3d7_10k')).toThrow(/UNIQUE constraint failed/)
    expect(() => addSubject(sqlite, 2, 8, 'js087')).toThrow(/UNIQUE constraint failed/)
    addSubject(sqlite, 3, 8, '3d7_10k')
    expect(column(sqlite, `SELECT COUNT(*) FROM study_subject WHERE name = '3d7_10k'`)).toEqual([1])
  })

  it('changes nothing on a database without the legacy rows', () => {
    addSubject(sqlite, 1, 3, 'A')
    addSpecimen(sqlite, 1, 1, 2, '2020-01-01')
    addContainer(sqlite, 1, 1, { comment: 'exhausted', remaining: 0 })
    addCryovialTube(sqlite, 1, 'CV1')

    evolveOperationalSchema(sqlite)

    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    expect(rows(sqlite, 'SELECT id, study_subject_id, collection_date FROM specimen')).toEqual([{ id: 1, study_subject_id: 1, collection_date: '2020-01-01' }])
    expect(rows(sqlite, 'SELECT id, remaining_quantity FROM storage_container')).toEqual([{ id: 1, remaining_quantity: 0 }])
    expect(rows(sqlite, 'SELECT id, barcode FROM cryovial_tube')).toEqual([{ id: 1, barcode: 'CV1' }])
    expect(column(sqlite, 'SELECT COUNT(*) FROM study_subject')).toEqual([1])
  })

  const aborts: Array<[string, (sqlite: Database) => void, RegExp]> = [
    [
      'an exhausted Container the lab did not review still has quantity',
      (db) => addContainer(db, 99999, 10, { comment: 'exhausted' }),
      /exhausted/,
    ],
    [
      'a reviewed exhausted Container has a remaining quantity other than 1',
      (db) => db.exec('UPDATE storage_container SET remaining_quantity = 0.5 WHERE id = 50465'),
      /exhausted/,
    ],
    [
      'there are more Specimens on a placeholder date than the lab reviewed',
      (db) => addSpecimen(db, 99999, 500, 21, '1111-01-01'),
      /placeholder collection date/,
    ],
    [
      'a micronix tube has a placeholder barcode, which cannot be emptied',
      (db) => {
        addContainer(db, 99999, 10)
        addMicronixTube(db, 99999, 1761, 'N/A')
      },
      /placeholder barcode/,
    ],
    [
      'Container 34513 has a tube row',
      (db) => addCryovialTube(db, 34513, 'X34513'),
      /Container 34513/,
    ],
    [
      'Container 34513 is the only Container of its Specimen',
      (db) => db.exec('DELETE FROM cryovial_tube WHERE id = 34514; DELETE FROM storage_container WHERE id = 34514'),
      /Container 34513/,
    ],
    [
      'plate 1760 holds a tube',
      (db) => {
        addContainer(db, 99999, 10)
        addMicronixTube(db, 99999, 1760, '1000000002')
      },
      /plate 1760/,
    ],
    [
      'plate 1760 has been renamed',
      (db) => db.exec(`UPDATE micronix_plate SET name = 'EXVIVO-28' WHERE id = 1760`),
      /plate 1760/,
    ],
    [
      'a Subject to merge has been renamed',
      (db) => db.exec(`UPDATE study_subject SET name = '3d7_10k_b' WHERE id = 31049`),
      /merge/,
    ],
    [
      'a Subject to merge has lost its target',
      (db) => db.exec(`UPDATE specimen SET study_subject_id = 31049 WHERE study_subject_id = 66543; DELETE FROM study_subject WHERE id = 66543`),
      /merge/,
    ],
    [
      'another Study has Subjects whose names differ only by case',
      (db) => {
        addSubject(db, 600, 8, 'abc')
        addSubject(db, 601, 8, 'ABC')
      },
      /differ only by case/,
    ],
  ]

  for (const [situation, change, message] of aborts) {
    it(`aborts, changing nothing, when ${situation}`, () => {
      seedProductionRows(sqlite)
      change(sqlite)
      const before = sqlite.serialize()

      expect(() => evolveOperationalSchema(sqlite)).toThrow(message)

      expect(getRecordedSchemaVersion(sqlite)).toBe(12)
      expect(Buffer.from(sqlite.serialize()).equals(Buffer.from(before))).toBe(true)
    })
  }
})
