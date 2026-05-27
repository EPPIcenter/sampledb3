import { vi } from 'vitest'
import type { MockApiOverrides } from './mock-api'
import type { StatisticsData } from '../../lib/api/statistics'

/** Empty statistics payload (fresh app). */
export const emptyStatisticsData: StatisticsData = {
  specimens: {
    total: 0,
    bySourceType: {},
    bySpecimenType: {},
    byStudy: {},
    collectionTimeline: [],
    creationTimeline: [],
  },
  containers: {
    total: 0,
    byType: {},
    byTags: {},
    byStatus: {},
    averagePerSpecimen: 0,
  },
  storage: {
    byLocation: [],
    byRootLocation: {},
  },
}

export const emptyStudiesList = {
  studies: [] as Array<{
    id: number
    title: string
    shortCode: string
    isLongitudinal: boolean
    leadPerson: string
    created: string
    lastUpdated: string
  }>,
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
}

export function statisticsPageMock(): MockApiOverrides {
  return {
    statisticsApi: {
      get: vi.fn().mockResolvedValue({ data: emptyStatisticsData }),
    },
  }
}

export function studiesPageMock(): MockApiOverrides {
  return {
    studiesApi: {
      list: vi.fn().mockResolvedValue(emptyStudiesList),
    },
  }
}

export function bloodControlsPageMock(): MockApiOverrides {
  return {
    controlsApi: {
      list: vi.fn().mockResolvedValue({ data: { controls: [] } }),
      listAllBatches: vi.fn().mockResolvedValue({ data: { batches: [] } }),
    },
    strainsApi: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  }
}

export function studiesHooksMock(): MockApiOverrides {
  return {
    studiesApi: {
      list: vi.fn(),
      get: vi.fn(),
      getSubjects: vi.fn(),
      getSummary: vi.fn(),
      getTimeline: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  }
}

export function subjectsHooksMock(): MockApiOverrides {
  return {
    subjectsApi: {
      list: vi.fn(),
      get: vi.fn(),
      getSummary: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      createBulk: vi.fn(),
      validateBulk: vi.fn(),
      createWithSpecimens: vi.fn(),
      merge: vi.fn(),
    },
  }
}

export function specimensHooksMock(): MockApiOverrides {
  return {
    specimensApi: {
      search: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      createBulk: vi.fn(),
      addContainer: vi.fn(),
    },
  }
}

export function containerDetailPageMock(): MockApiOverrides {
  return {
    default: { get: vi.fn() },
    derivationsApi: {
      listFromContainer: vi.fn().mockResolvedValue({ data: { derivations: [] } }),
      getSource: vi.fn().mockResolvedValue({ data: null }),
    },
  }
}

export function dashboardPageMock(): MockApiOverrides {
  return {
    default: { get: vi.fn().mockResolvedValue({ data: {} }) },
    studiesApi: {
      list: vi.fn().mockResolvedValue({ studies: [], pagination: { total: 0, totalPages: 0 } }),
    },
    activityApi: { recent: vi.fn().mockResolvedValue({ data: { activity: [] } }) },
    statisticsApi: { get: vi.fn().mockResolvedValue({ data: null }) },
    controlsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
    qpcrExperimentsApi: { list: vi.fn().mockResolvedValue({ data: { experiments: [] } }) },
  }
}

export function specimensPageMock(): MockApiOverrides {
  return {
    default: { get: vi.fn() },
    specimenTypesApi: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  }
}

export function locationsPageMock(): MockApiOverrides {
  return {
    locationsApi: {
      list: vi.fn(),
      get: vi.fn().mockResolvedValue({
        data: {
          location: {
            id: 1,
            name: 'Root',
            path: 'Root',
            parentId: null,
            storageTypeId: null,
            canContainCollections: true,
            created: '',
            lastUpdated: '',
          },
          contents: { plates: [], boxes: [], bags: [], cryovialBoxes: [] },
          hierarchyStats: undefined,
        },
      }),
    },
    searchApi: {
      search: vi.fn().mockResolvedValue({ data: { results: [], query: '', count: 0 } }),
    },
  }
}

export function settingsPageMock(): MockApiOverrides {
  return {
    settingsApi: {
      getAll: vi.fn().mockResolvedValue({
        data: {
          container_defaults: null,
          pagination_settings: null,
          password_requirements: null,
          session_settings: null,
          export_configurations: null,
          scanner_configurations: null,
          table_view_configurations: null,
        },
      }),
    },
  }
}

export function loginPageMock(): MockApiOverrides {
  return {
    authApi: {
      login: vi.fn(),
      selfRegister: vi.fn(),
    },
  }
}

export function registerPageMock(): MockApiOverrides {
  return {
    authApi: {
      selfRegister: vi.fn(),
    },
  }
}

export function setupPageMock(): MockApiOverrides {
  return {
    setupApi: {
      status: vi.fn().mockResolvedValue({ data: { initialized: false } }),
      initialize: vi.fn(),
    },
  }
}

export function setupGuardMock(): MockApiOverrides {
  return {
    setupApi: {
      status: vi.fn().mockResolvedValue({ data: { initialized: true } }),
    },
  }
}

export function collectionsPageMock(): MockApiOverrides {
  return {
    collectionsApi: {
      listAllCollections: vi.fn(),
    },
  }
}

export function controlsPageMock(): MockApiOverrides {
  return {
    controlsApi: {
      list: vi.fn().mockResolvedValue({ data: { controls: [] } }),
    },
  }
}

export function exportPageMock(): MockApiOverrides {
  return {
    exportApi: {
      validate: vi.fn(),
      export: vi.fn(),
    },
    exportConfigurationsApi: {
      getShared: vi.fn().mockResolvedValue({ data: { configurations: [] } }),
      getPersonal: vi.fn().mockResolvedValue({ data: { configurations: [] } }),
    },
    specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
    tagsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  }
}

export function derivationsBulkImportMock(): MockApiOverrides {
  return {
    derivationsApi: {
      validateCsv: vi.fn(),
      importCsv: vi.fn(),
    },
  }
}

export function derivationsBulkImportPageMock(): MockApiOverrides {
  return {
    derivationsApi: { validateCsv: vi.fn(), importCsv: vi.fn() },
    collectionsApi: { createMicronixPlate: vi.fn(), createCryovialBox: vi.fn() },
    specimenTypesApi: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      getContainerTypes: vi.fn().mockResolvedValue({ data: { containerTypes: ['micronix_tube'] } }),
    },
    unitsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  }
}

export function adminDashboardMock(): MockApiOverrides {
  return {
    adminApi: {
      getSystemStats: vi.fn().mockResolvedValue({ data: {} }),
    },
  }
}

export function adminUsersMock(): MockApiOverrides {
  return {
    adminApi: {
      getUsers: vi.fn().mockResolvedValue({ data: { users: [] } }),
    },
  }
}

export function adminErrorLogsMock(): MockApiOverrides {
  return {
    errorLogsApi: {
      list: vi.fn().mockResolvedValue({
        data: { logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } },
      }),
    },
  }
}

export function referenceDataLocationsMock(): MockApiOverrides {
  return {
    locationsApi: {
      list: vi.fn().mockResolvedValue({
        data: { locations: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      }),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }
}

export function studyDetailPageMock(): MockApiOverrides {
  return {
    studiesApi: {
      get: vi.fn(),
      getSubjects: vi.fn(),
      getSummary: vi.fn(),
      getTimeline: vi.fn(),
    },
    subjectsApi: {
      create: vi.fn(),
    },
  }
}

export function controlBatchDetailMock(): MockApiOverrides {
  return {
    controlsApi: {
      getBatchSummary: vi.fn(),
      deleteBatch: vi.fn(),
    },
  }
}

export function importPageMock(): MockApiOverrides {
  return {
    importsApi: {
      bulkCombined: vi.fn(),
    },
  }
}

export function qpcrExperimentsPageMock(): MockApiOverrides {
  return {
    qpcrExperimentsApi: {
      list: vi.fn().mockResolvedValue({ data: { experiments: [] } }),
    },
  }
}

export function specimenDetailPageMock(
  addContainer: (...args: unknown[]) => unknown
): MockApiOverrides {
  return {
    default: { get: vi.fn() },
    specimensApi: {
      get: vi.fn().mockResolvedValue({
        specimen: {
          id: 1,
          specimenTypeId: 1,
          specimenType: { name: 'Blood' },
          studySubjectId: 1,
          collectionDate: null,
        },
      }),
      addContainer,
    },
    settingsApi: {
      get: vi.fn().mockResolvedValue({ data: { value: null } }),
      getContainerTypeUnits: vi.fn().mockResolvedValue({ data: { units: [] } }),
      getUnits: vi.fn().mockResolvedValue({ data: [] }),
    },
    collectionsApi: {
      listCollectionsByType: vi.fn().mockResolvedValue({ data: { collections: [] } }),
    },
    specimenTypesApi: {
      getContainerTypes: vi.fn().mockResolvedValue({
        data: { containerTypes: ['micronix_tube', 'cryovial_tube'] },
      }),
    },
  }
}

export function specimenFormMock(): MockApiOverrides {
  return {
    collectionsApi: {
      listCollectionsByType: vi.fn().mockResolvedValue({ data: { collections: [] } }),
    },
    studiesApi: {
      list: vi.fn().mockResolvedValue({ studies: [{ id: 1, title: 'Study A', shortCode: 'SA' }] }),
      getSubjects: vi.fn().mockResolvedValue({ subjects: [] }),
    },
    specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Blood' }] }) },
    specimensApi: { create: vi.fn().mockResolvedValue({ data: { id: 1 } }) },
    controlsApi: { list: vi.fn().mockResolvedValue({ data: { controls: [] } }) },
    reagentsApi: { list: vi.fn().mockResolvedValue({ data: { reagents: [] } }) },
    cellLinesApi: { list: vi.fn().mockResolvedValue({ data: { cellLines: [] } }) },
    plasmidsApi: { list: vi.fn().mockResolvedValue({ data: { plasmids: [] } }) },
    standardsApi: { list: vi.fn().mockResolvedValue({ data: { standards: [] } }) },
    subjectsApi: { create: vi.fn().mockResolvedValue({ data: { id: 1 } }) },
    settingsApi: {
      getUnits: vi.fn().mockResolvedValue({
        data: [{ id: 1, symbol: 'uL', name: 'microliter', category: 'volume' }],
      }),
      getContainerTypeUnits: vi.fn().mockResolvedValue({ data: [] }),
      get: vi.fn().mockResolvedValue({ data: {} }),
    },
  }
}

const micronixMoveApis = {
  collectionsApi: {
    resolveContainers: vi.fn(),
    listCollectionsByType: vi.fn(),
    moveContainers: vi.fn(),
    getMicronixPlate: vi.fn(),
  },
  locationsApi: { list: vi.fn() },
  scannerConfigurationsApi: { getAll: vi.fn() },
}

export function micronixMovePageMock(): MockApiOverrides {
  return { ...micronixMoveApis }
}

export function micronixMoveAuthMock(): MockApiOverrides {
  return {
    authApi: {
      getCurrentUser: vi.fn().mockResolvedValue({
        data: { user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } },
      }),
    },
  }
}

export function bulkImportFlowMock(): MockApiOverrides {
  return {
    specimenTypesApi: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Serum' }, { id: 2, name: 'Plasma' }] }),
      getByContainerType: vi.fn().mockResolvedValue({
        data: { specimenTypes: [{ id: 1, name: 'Whole Blood', created: '', lastUpdated: '' }] },
      }),
    },
    subjectsApi: {
      createBulk: vi.fn().mockResolvedValue({ data: { created: 2, subjects: [] } }),
      validateBulk: vi.fn().mockResolvedValue({ data: { valid: true, errors: [] } }),
    },
    specimensApi: {
      createBulk: vi.fn().mockResolvedValue({ data: { created: 0, specimens: [] } }),
      validateBulk: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    },
    importsApi: {
      bulkCombined: vi.fn().mockResolvedValue({
        data: {
          summary: { subjectsCreated: 1, specimensCreated: 1, containersCreated: 0, subjectsUpdated: 0 },
          results: [],
          errors: [],
        },
      }),
      bulkCombinedValidate: vi.fn().mockResolvedValue({ data: { valid: true, errors: [] } }),
    },
    collectionsApi: {
      check: vi.fn().mockResolvedValue({ data: { results: [] } }),
      listMicronixPlates: vi.fn().mockResolvedValue({ data: [] }),
      listCryovialBoxes: vi.fn().mockResolvedValue({ data: [] }),
      listBoxes: vi.fn().mockResolvedValue({ data: [] }),
      listBags: vi.fn().mockResolvedValue({ data: [] }),
    },
  }
}
