import { api } from './client'
import type { User, UserSession } from './auth'
export interface AdminSystemStats {
  users: {
    total: number
    active: number
    deleted: number
    byRole: Record<string, number>
    recentLogins: number
  }
  sessions: {
    active: number
  }
  entities: {
    studies: number
    subjects: number
    specimens: number
    containers: number
  }
  containers: {
    micronixTubes: number
    cryovialTubes: number
    papers: number
    staticWells: number
  }
  collections: {
    micronixPlates: number
    cryovialBoxes: number
    boxes: number
    bags: number
  }
  referenceData: {
    specimenTypes: number
    storageTypes: number
    tags: number
    units: number
    strains: number
  }
  locations: {
    total: number
  }
}
export const adminApi = {
  getUsers: (includeDeleted = false) =>
    api.get<{ users: User[] }>('/auth/users', { params: { includeDeleted } }),
  createUser: (data: { email: string; name: string; password: string; role?: 'admin' | 'member' | 'viewer' }) =>
    api.post<{ user: User }>('/auth/register', data),
  updateUser: (id: number, data: { name?: string; email?: string; role?: 'admin' | 'member' | 'viewer' }) =>
    api.put<{ user: User }>(`/auth/users/${id}`, data),
  deleteUser: (id: number) =>
    api.delete<{ message: string }>(`/auth/users/${id}`),
  restoreUser: (id: number) =>
    api.post<{ user: User }>(`/auth/users/${id}/restore`),
  resetPassword: (id: number, password: string) =>
    api.patch<{ message: string }>(`/auth/users/${id}/password`, { password }),
  getUserSessions: (userId: number) =>
    api.get<{ sessions: UserSession[] }>(`/auth/users/${userId}/sessions`),
  revokeSession: (sessionId: string) =>
    api.delete<{ message: string }>(`/auth/sessions/${sessionId}`),
  approveUser: (id: number) =>
    api.patch<{ user: User }>(`/auth/users/${id}/approve`),
  getSystemStats: () =>
    api.get<AdminSystemStats>('/statistics/admin'),
  getEmptyCollections: () =>
    api.get<{ collections: EmptyCollectionItem[] }>('/admin/data-audit/empty-collections'),
  deleteEmptyCollections: (ids: EmptyCollectionsDeleteIds) =>
    api.post<{ deleted: number; errors?: string[] }>('/admin/data-audit/empty-collections/delete', { ids }),
  getIntegrityReport: () =>
    api.get<IntegrityReport>('/admin/data-audit/integrity-report'),
}
export interface DuplicateBarcodeItem {
  barcode: string
  containerType: 'micronix_tube'
  ids: number[]
}

export interface LocationPathInconsistencyItem {
  id: number
  name: string
  storedPath: string | null
  expectedPath: string
}

export interface ContainerWithNoGridPositionItem {
  id: number
  containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well'
  collectionId: number
}

export interface IntegrityReport {
  emptyCollections: EmptyCollectionItem[]
  collectionsWithMissingLocation: CollectionWithMissingLocationItem[]
  containersWithMissingSpecimen: ContainerWithMissingSpecimenItem[]
  subtypeOrphans: SubtypeOrphanItem[]
  sheetsWithMissingBoxOrBag: SheetWithMissingBoxOrBagItem[]
  specimensWithMissingSubjectOrBatch: SpecimenWithMissingSubjectOrBatchItem[]
  studySubjectsWithMissingStudy: StudySubjectWithMissingStudyItem[]
  derivationBrokenRefs: DerivationBrokenRefItem[]
  storageContainerTagOrphans: StorageContainerTagOrphanItem[]
  duplicateBarcodes: DuplicateBarcodeItem[]
  locationPathInconsistencies: LocationPathInconsistencyItem[]
  containersWithNoGridPosition: ContainerWithNoGridPositionItem[]
}

export interface CollectionWithMissingLocationItem {
  type: EmptyCollectionItem['type']
  id: number
  name: string
  locationId: number
}

export interface ContainerWithMissingSpecimenItem {
  id: number
  specimenId: number
}

export interface SubtypeOrphanItem {
  id: number
}

export interface SheetWithMissingBoxOrBagItem {
  id: number
  name: string
  boxId: number | null
  bagId: number | null
}

export interface SpecimenWithMissingSubjectOrBatchItem {
  id: number
  studySubjectId: number | null
  controlBatchId: number | null
}

export interface StudySubjectWithMissingStudyItem {
  id: number
  studyId: number
  name: string
}

export interface DerivationBrokenRefItem {
  id: number
  parentContainerId: number
  childContainerId: number
}

export interface StorageContainerTagOrphanItem {
  storageContainerId: number
  tagId: number
}

export type CollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'

export interface EmptyCollectionItem {
  type: CollectionType
  id: number
  name: string
  locationId?: number
  locationPath?: string | null
}

export interface EmptyCollectionsDeleteIds {
  micronix_plate?: number[]
  cryovial_box?: number[]
  box?: number[]
  bag?: number[]
}
