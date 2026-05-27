import type { MockApiOverrides } from './mock-api'

/** Domain file under `src/lib/api/` (not `types` — type-only module). */
export type ApiModuleId =
  | 'studies'
  | 'subjects'
  | 'specimens'
  | 'reference-data'
  | 'controls'
  | 'reagents'
  | 'locations'
  | 'collections'
  | 'imports'
  | 'export'
  | 'derivations'
  | 'search'
  | 'statistics'
  | 'settings'
  | 'auth'
  | 'admin'
  | 'qpcr'
  | 'error-logs'
  | 'client'

export const API_MODULE_IDS: ApiModuleId[] = [
  'studies',
  'subjects',
  'specimens',
  'reference-data',
  'controls',
  'reagents',
  'locations',
  'collections',
  'imports',
  'export',
  'derivations',
  'search',
  'statistics',
  'settings',
  'auth',
  'admin',
  'qpcr',
  'error-logs',
  'client',
]

export const API_KEY_TO_MODULE: Record<string, ApiModuleId> = {
  studiesApi: 'studies',
  subjectsApi: 'subjects',
  specimensApi: 'specimens',
  specimenTypesApi: 'reference-data',
  tagsApi: 'reference-data',
  storageTypesApi: 'reference-data',
  strainsApi: 'reference-data',
  unitsApi: 'reference-data',
  cellLinesApi: 'reference-data',
  plasmidsApi: 'reference-data',
  standardsApi: 'reference-data',
  controlsApi: 'controls',
  reagentsApi: 'reagents',
  locationsApi: 'locations',
  collectionsApi: 'collections',
  importsApi: 'imports',
  exportApi: 'export',
  derivationsApi: 'derivations',
  searchApi: 'search',
  activityApi: 'search',
  statisticsApi: 'statistics',
  settingsApi: 'settings',
  exportConfigurationsApi: 'settings',
  tableViewConfigurationsApi: 'settings',
  scannerConfigurationsApi: 'settings',
  setupApi: 'settings',
  authApi: 'auth',
  adminApi: 'admin',
  qpcrExperimentsApi: 'qpcr',
  errorLogsApi: 'error-logs',
  default: 'client',
}

const MODULE_API_KEYS: Record<ApiModuleId, string[]> = {
  studies: ['studiesApi'],
  subjects: ['subjectsApi'],
  specimens: ['specimensApi'],
  'reference-data': [
    'specimenTypesApi',
    'tagsApi',
    'storageTypesApi',
    'strainsApi',
    'unitsApi',
    'cellLinesApi',
    'plasmidsApi',
    'standardsApi',
  ],
  controls: ['controlsApi'],
  reagents: ['reagentsApi'],
  locations: ['locationsApi'],
  collections: ['collectionsApi'],
  imports: ['importsApi'],
  export: ['exportApi'],
  derivations: ['derivationsApi'],
  search: ['searchApi', 'activityApi'],
  statistics: ['statisticsApi'],
  settings: [
    'settingsApi',
    'exportConfigurationsApi',
    'tableViewConfigurationsApi',
    'scannerConfigurationsApi',
    'setupApi',
  ],
  auth: ['authApi'],
  admin: ['adminApi'],
  qpcr: ['qpcrExperimentsApi'],
  'error-logs': ['errorLogsApi'],
  client: ['api'],
}

export function modulesForOverrides(overrides: MockApiOverrides): ApiModuleId[] {
  const mods = new Set<ApiModuleId>()
  for (const key of Object.keys(overrides)) {
    const mod = API_KEY_TO_MODULE[key]
    if (mod) mods.add(mod)
  }
  return [...mods]
}

export function moduleApiKeys(moduleId: ApiModuleId): string[] {
  return MODULE_API_KEYS[moduleId]
}
