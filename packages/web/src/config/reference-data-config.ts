 
import React from 'react'
import type { Column } from '../components/ReferenceDataTable'
import type {
  SpecimenType,
  Tag,
  StorageType,
  Strain,
  Unit,
} from '../lib/api'
import {
  specimenTypesApi,
  tagsApi,
  storageTypesApi,
  strainsApi,
  unitsApi,
} from '../lib/api'
import ContainerTypesCell from '../components/ContainerTypesCell'
import ContainerTypeToggle from '../components/ContainerTypeToggle'

export type ReferenceDataType =
  | 'specimen-types'
  | 'tags'
  | 'storage-types'
  | 'strains'
  | 'units'

export interface ReferenceDataConfig {
  id: ReferenceDataType
  label: string
  // API methods - can return either { data: T[] } or { data: { [key: string]: any[] } }
  list: () => Promise<{ data: any[] | { [key: string]: any[] } }>
  get?: (id: number) => Promise<any>
  create?: (data: any) => Promise<any>
  update?: (id: number, data: any) => Promise<any>
  delete?: (id: number) => Promise<any>
  // Data access
  getDataKey: () => string
  getItemKey: () => string
  // Table configuration
  getColumns: (dependencies?: {
    storageTypes?: StorageType[]
    locations?: Location[]
    containerTypeRelationships?: Record<number, string[]>
    containerTypeUsageInfo?: Record<number, Record<string, boolean>>
    onToggleContainerType?: (specimenTypeId: number, containerType: string, isAdding: boolean) => Promise<void>
    containerTypesDisabled?: boolean
  }) => Column<any>[]
  // Form configuration
    getFormFields: (editingItem?: any, formData?: any, dependencies?: {
      containerTypeRelationships?: Record<number, string[]>
      containerTypeUsageInfo?: Record<number, Record<string, boolean>>
      onToggleContainerType?: ((specimenTypeId: number, containerType: string, isAdding: boolean) => Promise<void>) | undefined
      containerTypesDisabled?: boolean
    }) => Array<{
    key: string
    label: string
    type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'custom'
    required?: boolean | ((formData: any) => boolean)
    hidden?: (formData: any) => boolean
    disabled?: (formData: any) => boolean
    loadOptions?: () => Promise<Array<{ value: any; label: string }>>
    render?: (value: any, formData: any, onChange: (value: any) => void) => React.ReactNode
  }>
  // Special handling
  requiresPagination?: boolean
  requiresSearch?: boolean
  requiresDependencies?: ReferenceDataType[]
  readOnly?: boolean // Mark as read-only for legacy data viewing
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
    getColumns: (deps) => {
      const containerTypeRelationships = deps?.containerTypeRelationships || {}
      const containerTypeUsageInfo = deps?.containerTypeUsageInfo || {}
      const onToggleContainerType = deps?.onToggleContainerType
      const containerTypesDisabled = deps?.containerTypesDisabled || false
      
      return [
        { key: 'name', label: 'Name' },
        {
          key: 'containerTypes',
          label: 'Allowed Container Types',
          render: (value: any, item: SpecimenType) => {
            const allowedTypes = containerTypeRelationships[item.id] ?? []
            const usageInfo = containerTypeUsageInfo[item.id]
            return React.createElement(ContainerTypesCell, {
              item,
              allowedTypes,
              onToggle: onToggleContainerType,
              usageInfo,
              disabled: containerTypesDisabled,
            })
          },
        },
        {
          key: 'created',
          label: 'Created',
          render: (value: string) => new Date(value).toLocaleDateString(),
        },
      ]
    },
    getFormFields: (editingItem, formData, deps) => {
      const fields: Array<{
        key: string
        label: string
        type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'custom'
        required?: boolean
        render?: (value: any, formData: any, onChange: (value: any) => void) => React.ReactNode
      }> = [
        { key: 'name', label: 'Name', required: true },
      ]

      // Add container types field if editing an existing specimen type
      if (editingItem?.id && deps?.containerTypeRelationships) {
        const allowedTypes = deps.containerTypeRelationships[editingItem.id]
        const usageInfo = deps.containerTypeUsageInfo?.[editingItem.id] ?? {}  
        const containerTypesDisabled = deps.containerTypesDisabled || false
        fields.push({
          key: 'containerTypes',
          label: 'Allowed Container Types',
          type: 'custom',
          render: (value: any, formData: any, onChange: (value: any) => void) => {
            if (!deps.onToggleContainerType) {
              return React.createElement('div', null, 'Container type toggle unavailable')
            }
            return React.createElement(ContainerTypeToggle, {
              specimenTypeId: editingItem.id,
              allowedTypes,
              onToggle: deps.onToggleContainerType,
              usageInfo,
              disabled: containerTypesDisabled,
            })
          },
        })
      }

      return fields
    },
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
    id: 'units',
    label: 'Units',
    list: () => unitsApi.list(),
    get: (id) => unitsApi.get(id),
    create: (data) => unitsApi.create(data),
    update: (id, data) => unitsApi.update(id, data),
    delete: (id) => unitsApi.delete(id),
    getDataKey: () => 'units',
    getItemKey: () => 'unit',
    getColumns: () => [
      { key: 'symbol', label: 'Symbol' },
      { key: 'name', label: 'Name' },
      { key: 'category', label: 'Category' },
    ],
    getFormFields: () => [
      { key: 'symbol', label: 'Symbol', required: true },
      { key: 'name', label: 'Name', required: true },
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: [
          { value: 'volume', label: 'Volume' },
          { value: 'mass', label: 'Mass' },
          { value: 'count', label: 'Count' },
          { value: 'concentration', label: 'Concentration' },
          { value: 'other', label: 'Other' },
        ],
      },
    ],
  },
]

export function getReferenceDataConfig(id: ReferenceDataType): ReferenceDataConfig | undefined {
  return referenceDataConfigs.find((config) => config.id === id)
}

