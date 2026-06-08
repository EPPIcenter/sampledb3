import { vi } from 'vitest'
import type { MockApiOverrides } from './mock-api'
import { mockSettingsApiGetValue } from './settings-mocks'
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
      get: vi.fn().mockResolvedValue(emptyStatisticsData),
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
      list: vi.fn().mockResolvedValue({ controls: [] }),
      listAllBatches: vi.fn().mockResolvedValue({ batches: [] }),
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
      listFromContainer: vi.fn().mockResolvedValue({ derivations: [], count: 0 }),
      getSource: vi.fn().mockResolvedValue(null),
    },
  }
}

export function dashboardPageMock(): MockApiOverrides {
  return {
    default: {
      get: vi.fn().mockImplementation((url: string) => {
        const emptyList = { pagination: { total: 0 }, studies: [], specimens: [], subjects: [], containers: [], locations: [] }
        if (url === '/studies') return Promise.resolve({ studies: [], pagination: { total: 0 } })
        if (url === '/specimens') return Promise.resolve({ specimens: [], pagination: { total: 0 } })
        if (url === '/subjects') return Promise.resolve({ subjects: [], pagination: { total: 0 } })
        if (url === '/containers') return Promise.resolve({ containers: [], pagination: { total: 0 } })
        if (url === '/locations') return Promise.resolve({ locations: [], pagination: { total: 0 } })
        return Promise.resolve(emptyList)
      }),
    },
    studiesApi: {
      list: vi.fn().mockResolvedValue({ studies: [], pagination: { total: 0, totalPages: 0 } }),
      getSummaries: vi.fn().mockResolvedValue({ summaries: [] }),
    },
    activityApi: { recent: vi.fn().mockResolvedValue({ activity: [] }) },
    statisticsApi: { get: vi.fn().mockResolvedValue(null) },
    controlsApi: { list: vi.fn().mockResolvedValue({ controls: [] }) },
    qpcrExperimentsApi: { list: vi.fn().mockResolvedValue({ experiments: [] }) },
  }
}

export function specimensPageMock(): MockApiOverrides {
  return {
    default: { get: vi.fn() },
    specimensApi: {
      search: vi.fn().mockResolvedValue({ specimens: [] }),
    },
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
      }),
    },
    searchApi: {
      search: vi.fn().mockResolvedValue({ results: [], query: '', count: 0 }),
    },
  }
}

export function settingsPageMock(): MockApiOverrides {
  return {
    settingsApi: {
      getAll: vi.fn().mockResolvedValue({
        container_defaults: null,
        pagination_settings: null,
        password_requirements: null,
        session_settings: null,
        export_configurations: null,
        scanner_configurations: null,
        table_view_configurations: null,
      }),
      getValue: mockSettingsApiGetValue(),
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
      status: vi.fn().mockResolvedValue({ initialized: false }),
      initialize: vi.fn(),
    },
  }
}

export function setupGuardMock(): MockApiOverrides {
  return {
    setupApi: {
      status: vi.fn().mockResolvedValue({ initialized: true }),
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
      list: vi.fn().mockResolvedValue({ controls: [] }),
    },
  }
}

export function exportPageMock(): MockApiOverrides {
  return {
    exportApi: {
      validate: vi.fn(),
      export: vi.fn(),
    },
    settingsApi: {
      getValue: mockSettingsApiGetValue(),
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
      getContainerTypes: vi.fn().mockResolvedValue({ containerTypes: ['micronix_tube'] }),
    },
    unitsApi: { listAll: vi.fn().mockResolvedValue([]) },
  }
}

export function adminDashboardMock(): MockApiOverrides {
  return {
    adminApi: {
      getSystemStats: vi.fn().mockResolvedValue({}),
    },
  }
}

export function adminUsersMock(): MockApiOverrides {
  return {
    adminApi: {
      getUsers: vi.fn().mockResolvedValue({ users: [] }),
    },
  }
}

export function adminErrorLogsMock(): MockApiOverrides {
  return {
    errorLogsApi: {
      list: vi.fn().mockResolvedValue({
        logs: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      }),
    },
  }
}

export function referenceDataLocationsMock(): MockApiOverrides {
  return {
    locationsApi: {
      list: vi.fn().mockResolvedValue({
        locations: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      }),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }
}

export function subjectDetailPageMock(): MockApiOverrides {
  return {
    subjectsApi: {
      getSummary: vi.fn().mockResolvedValue({
        subject: {
          id: 1,
          name: 'Subject 1',
          studyId: 1,
          study: { id: 1, title: 'Study', shortCode: 'ST1' },
        },
        specimens: [],
        summary: {
          totalSpecimens: 0,
          totalContainers: 0,
          specimenTypes: [],
          collectionDateRange: null,
          timeline: [],
        },
      }),
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
      list: vi.fn().mockResolvedValue({ experiments: [] }),
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
    containersApi: {
      list: vi.fn().mockResolvedValue({ containers: [] }),
    },
    settingsApi: {
      getValue: vi.fn().mockResolvedValue(null),
      getContainerTypeUnits: vi.fn().mockResolvedValue({ units: [] }),
    },
    unitsApi: {
      listAll: vi.fn().mockResolvedValue([]),
    },
    collectionsApi: {
      listCollectionsByType: vi.fn().mockResolvedValue({ collections: [] }),
    },
    specimenTypesApi: {
      getContainerTypes: vi.fn().mockResolvedValue({
        containerTypes: ['micronix_tube', 'cryovial_tube'],
      }),
    },
  }
}

export function specimenFormMock(): MockApiOverrides {
  return {
    collectionsApi: {
      listCollectionsByType: vi.fn().mockResolvedValue({ collections: [] }),
    },
    studiesApi: {
      list: vi.fn().mockResolvedValue({ studies: [{ id: 1, title: 'Study A', shortCode: 'SA' }] }),
      getSubjects: vi.fn().mockResolvedValue({ subjects: [] }),
    },
    specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Blood' }] }) },
    specimensApi: { create: vi.fn().mockResolvedValue({ specimen: { id: 1 } }) },
    controlsApi: { list: vi.fn().mockResolvedValue({ controls: [] }) },
    reagentsApi: { list: vi.fn().mockResolvedValue({ reagents: [] }) },
    cellLinesApi: { list: vi.fn().mockResolvedValue({ cellLines: [] }) },
    plasmidsApi: { list: vi.fn().mockResolvedValue({ plasmids: [] }) },
    standardsApi: { list: vi.fn().mockResolvedValue({ standards: [] }) },
    subjectsApi: { create: vi.fn().mockResolvedValue({ subject: { id: 1 } }) },
    settingsApi: {
      getContainerTypeUnits: vi.fn().mockResolvedValue({ units: [] }),
      get: vi.fn().mockResolvedValue({ key: 'container_defaults', value: null }),
    },
    unitsApi: {
      listAll: vi.fn().mockResolvedValue([
        { id: 1, symbol: 'uL', name: 'microliter', category: 'volume' },
      ]),
    },
  }
}

const micronixMoveApis = {
  collectionsApi: {
    resolveContainers: vi.fn(),
    listCollectionsByType: vi.fn(),
    moveContainers: vi.fn(),
    getMicronixPlate: vi.fn(),
    createMicronixPlate: vi.fn(),
  },
  locationsApi: { list: vi.fn() },
  settingsApi: {
    getValue: mockSettingsApiGetValue(),
  },
}

export function micronixMovePageMock(): MockApiOverrides {
  return { ...micronixMoveApis }
}

export function micronixMoveAuthMock(): MockApiOverrides {
  return {
    authApi: {
      getCurrentUser: vi.fn().mockResolvedValue({
        user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' },
      }),
    },
  }
}

export function bulkImportFlowMock(): MockApiOverrides {
  return {
    specimenTypesApi: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Serum' }, { id: 2, name: 'Plasma' }] }),
      getByContainerType: vi.fn().mockResolvedValue({
        specimenTypes: [{ id: 1, name: 'Whole Blood', created: '', lastUpdated: '' }],
      }),
    },
    subjectsApi: {
      createBulk: vi.fn().mockResolvedValue({ created: 2, subjects: [] }),
      validateBulk: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    },
    specimensApi: {
      createBulk: vi.fn().mockResolvedValue({ created: 0, specimens: [] }),
      validateBulk: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    },
    importsApi: {
      bulkCombined: vi.fn().mockResolvedValue({
        summary: { subjectsCreated: 1, specimensCreated: 1, containersCreated: 0, subjectsUpdated: 0 },
        results: [],
        errors: [],
      }),
      bulkCombinedValidate: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    },
    collectionsApi: {
      check: vi.fn().mockResolvedValue({ results: [] }),
      listMicronixPlates: vi.fn().mockResolvedValue([]),
      listCryovialBoxes: vi.fn().mockResolvedValue([]),
      listBoxes: vi.fn().mockResolvedValue([]),
      listBags: vi.fn().mockResolvedValue([]),
    },
  }
}
