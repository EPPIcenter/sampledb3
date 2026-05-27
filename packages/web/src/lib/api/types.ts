export interface Study {
  id: number
  title: string
  description?: string
  shortCode: string
  isLongitudinal: boolean
  leadPerson: string
  created: string
  lastUpdated: string
}

export interface StudySubject {
  id: number
  studyId: number
  name: string
  created: string
  lastUpdated: string
  specimenCount?: number
}

export interface Specimen {
  id: number
  studySubjectId?: number
  controlBatchId?: number
  specimenTypeId: number
  collectionDate?: string
  created: string
  lastUpdated: string
  specimenType?: { id: number; name: string }
  sourceType?: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
  sourceId?: number
}

export interface SpecimenType {
  id: number
  name: string
  created: string
  lastUpdated: string
}


export interface Location {
  id: number
  parentId: number | null
  name: string
  storageTypeId: string | null  // Only root locations have storage_type_id
  storageTypeName?: string | null  // Storage type name (for root locations)
  effectiveStorageTypeId?: string | null  // Effective storage type ID (from root)
  effectiveStorageTypeName?: string | null  // Effective storage type name (from root)
  description?: string
  canContainCollections: boolean
  path?: string  // Full path string
  created: string
  lastUpdated: string
}


export interface Unit {
  id: number
  symbol: string
  name: string
  category: string
}
