import type { Column } from '../components/ReferenceDataTable'
import type {
  SpecimenType,
  Tag,
  StorageType,
  SampleType,
  Strain,
  Composition,
  Location,
} from '../lib/api'
import {
  specimenTypesApi,
  tagsApi,
  storageTypesApi,
  sampleTypesApi,
  strainsApi,
  compositionsApi,
  locationsApi,
} from '../lib/api'

export type ReferenceDataType =
  | 'specimen-types'
  | 'locations'
  | 'tags'
  | 'storage-types'
  | 'sample-types'
  | 'strains'
  | 'compositions'

export interface ReferenceDataConfig {
  id: ReferenceDataType
  label: string
  // API methods
  list: () => Promise<{ data: { [key: string]: any[] } }>
  get?: (id: number) => Promise<{ data: { [key: string]: any } }>
  create: (data: any) => Promise<any>
  update: (id: number, data: any) => Promise<any>
  delete: (id: number) => Promise<any>
  // Data access
  getDataKey: () => string
  getItemKey: () => string
  // Table configuration
  getColumns: (dependencies?: {
    storageTypes?: StorageType[]
    sampleTypes?: SampleType[]
  }) => Column<any>[]
  // Form configuration
  getFormFields: (editingItem?: any) => Array<{
    key: string
    label: string
    type?: 'text' | 'number' | 'textarea'
    required?: boolean
    loadOptions?: () => Promise<Array<{ value: any; label: string }>>
  }>
  // Special handling
  requiresPagination?: boolean
  requiresSearch?: boolean
  requiresDependencies?: ReferenceDataType[]
}

export const referenceDataConfigs: ReferenceDataConfig[] = [
  {
    id: 'specimen-types',
    label: 'Specimen Types',
    list: () => specimenTypesApi.list(),
    get: (id) => specimenTypesApi.get(id),
    create: (data) => specimenTypesApi.create(data),
    update: (id, data) => specimenTypesApi.update(id, data),
    delete: (id) => specimenTypesApi.delete(id),
    getDataKey: () => 'specimenTypes',
    getItemKey: () => 'specimenType',
    getColumns: () => [
      { key: 'name', label: 'Name' },
      {
        key: 'created',
        label: 'Created',
        render: (value: string) => new Date(value).toLocaleDateString(),
      },
    ],
    getFormFields: () => [
      { key: 'name', label: 'Name', required: true },
    ],
  },
  {
    id: 'tags',
    label: 'Tags',
    list: () => tagsApi.list(),
    get: (id) => tagsApi.get(id),
    create: (data) => tagsApi.create(data),
    update: (id, data) => tagsApi.update(id, data),
    delete: (id) => tagsApi.delete(id),
    getDataKey: () => 'tags',
    getItemKey: () => 'tag',
    getColumns: () => [
      { key: 'name', label: 'Name' },
    ],
    getFormFields: () => [
      { key: 'name', label: 'Name', required: true },
    ],
  },
  {
    id: 'storage-types',
    label: 'Storage Types',
    list: () => storageTypesApi.list(),
    get: (id) => storageTypesApi.get(id),
    create: (data) => storageTypesApi.create(data),
    update: (id, data) => storageTypesApi.update(id, data),
    delete: (id) => storageTypesApi.delete(id),
    getDataKey: () => 'storageTypes',
    getItemKey: () => 'storageType',
    getColumns: () => [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
    ],
    getFormFields: () => [
      { key: 'name', label: 'Name', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  {
    id: 'sample-types',
    label: 'Sample Types',
    list: () => sampleTypesApi.list(),
    get: (id) => sampleTypesApi.get(id),
    create: (data) => sampleTypesApi.create(data),
    update: (id, data) => sampleTypesApi.update(id, data),
    delete: (id) => sampleTypesApi.delete(id),
    getDataKey: () => 'sampleTypes',
    getItemKey: () => 'sampleType',
    requiresDependencies: ['sample-types'],
    getColumns: (deps) => [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      {
        key: 'parentId',
        label: 'Parent',
        render: (value: number | null | undefined, item: SampleType) => {
          if (!value) return 'None (Root)'
          const parent = deps?.sampleTypes?.find((st) => st.id === value)
          return parent ? parent.name : `ID: ${value}`
        },
      },
    ],
    getFormFields: (editingItem) => [
      { key: 'name', label: 'Name', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      {
        key: 'parentId',
        label: 'Parent Sample Type',
        type: 'number',
        loadOptions: async () => {
          const response = await sampleTypesApi.list()
          const currentId = editingItem?.id
          const options = response.data.sampleTypes
            .filter((st: SampleType) => st.id !== currentId)
            .map((st: SampleType) => ({
              value: st.id,
              label: st.description ? `${st.name} - ${st.description}` : st.name,
            }))
          return [{ value: '', label: 'None (Root)' }, ...options]
        },
      },
    ],
  },
  {
    id: 'strains',
    label: 'Strains',
    list: () => strainsApi.list(),
    get: (id) => strainsApi.get(id),
    create: (data) => strainsApi.create(data),
    update: (id, data) => strainsApi.update(id, data),
    delete: (id) => strainsApi.delete(id),
    getDataKey: () => 'strains',
    getItemKey: () => 'strain',
    getColumns: () => [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
    ],
    getFormFields: () => [
      { key: 'name', label: 'Name', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  {
    id: 'compositions',
    label: 'Compositions',
    list: () => compositionsApi.list(),
    get: (id) => compositionsApi.get(id),
    create: (data) => compositionsApi.create(data),
    update: (id, data) => compositionsApi.update(id, data),
    delete: (id) => compositionsApi.delete(id),
    getDataKey: () => 'compositions',
    getItemKey: () => 'composition',
    getColumns: () => [
      { key: 'label', label: 'Label' },
      { key: 'index', label: 'Index' },
      {
        key: 'legacy',
        label: 'Legacy',
        render: (value: number) => value ? 'Yes' : 'No',
      },
    ],
    getFormFields: () => [
      { key: 'label', label: 'Label', required: true },
      { key: 'index', label: 'Index', type: 'number' },
      { key: 'legacy', label: 'Legacy', type: 'number', required: true },
    ],
  },
  {
    id: 'locations',
    label: 'Locations',
    list: () => locationsApi.list(1, 50, '') as any, // Will be called with page/limit/search separately
    get: (id) => locationsApi.get(id),
    create: (data) => locationsApi.create(data),
    update: (id, data) => locationsApi.update(id, data),
    delete: (id) => locationsApi.delete(id),
    getDataKey: () => 'locations',
    getItemKey: () => 'location',
    requiresPagination: true,
    requiresSearch: true,
    requiresDependencies: ['storage-types'],
    getColumns: (deps) => [
      { key: 'locationRoot', label: 'Root' },
      { key: 'levelI', label: 'Level I' },
      { key: 'levelII', label: 'Level II' },
      { key: 'levelIII', label: 'Level III' },
      {
        key: 'storageTypeId',
        label: 'Storage Type',
        render: (value: string, item: Location) => {
          const storageType = deps?.storageTypes?.find(
            (st) => st.name === value || String(st.id) === value
          )
          if (storageType) {
            return storageType.description
              ? `${storageType.name} - ${storageType.description}`
              : storageType.name
          }
          return value
        },
      },
      { key: 'description', label: 'Description' },
    ],
    getFormFields: () => [
      { key: 'locationRoot', label: 'Location Root', required: true },
      {
        key: 'storageTypeId',
        label: 'Storage Type',
        required: true,
        loadOptions: async () => {
          const response = await storageTypesApi.list()
          return response.data.storageTypes.map((st: StorageType) => ({
            value: String(st.id),
            label: st.description ? `${st.name} - ${st.description}` : st.name,
          }))
        },
      },
      { key: 'levelI', label: 'Level I', required: true },
      { key: 'levelII', label: 'Level II', required: true },
      { key: 'levelIII', label: 'Level III' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
]

export function getReferenceDataConfig(id: ReferenceDataType): ReferenceDataConfig | undefined {
  return referenceDataConfigs.find((config) => config.id === id)
}

