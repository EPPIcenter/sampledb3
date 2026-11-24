import { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useUser } from '../contexts/UserContext'
import ReferenceDataTable from '../components/ReferenceDataTable'
import ReferenceDataForm from '../components/ReferenceDataForm'
import {
  referenceDataConfigs,
  getReferenceDataConfig,
  type ReferenceDataConfig,
  type ReferenceDataType,
} from '../config/reference-data-config'
import { invalidateAfterReferenceDataWrite } from '../hooks/useReferenceData'
import { useReferenceDataTab, useSpecimenTypeContainerTypes } from '../hooks/useReferenceDataPage'
import { specimenTypesApi } from '../lib/api/reference-data'
import type { SpecimenType } from '../lib/api/types'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import { PageError, fromQuery, getQueryErrorMessage } from '../ui'
import '../styles/reference-data.css'

export default function ReferenceData() {
  const [searchParams] = useSearchParams()
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tab from URL may be missing or invalid
  const activeTab = (searchParams.get('tab') as ReferenceDataType) || 'specimen-types'
  const config = getReferenceDataConfig(activeTab)

  if (!config) {
    return <div>Invalid tab</div>
  }
  return <ReferenceDataContent activeTab={activeTab} config={config} />
}

/** Split out so its hooks run on every render, even when the tab is invalid. */
function ReferenceDataContent({
  activeTab,
  config,
}: {
  activeTab: ReferenceDataType
  config: ReferenceDataConfig
}) {
  const { canManageReferenceData, canCreateTags } = useUser()
  const [, setSearchParams] = useSearchParams()
  // Keep isAdmin for backward compatibility in this file (used in multiple places)
  const isAdmin = canManageReferenceData
  // A member adds Tags and nothing else: no edit or delete, and no other tab (#141).
  const canAdd = canManageReferenceData || (activeTab === 'tags' && canCreateTags)

  const setActiveTab = (tab: ReferenceDataType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  const queryClient = useQueryClient()
  const [editingItem, setEditingItem] = useState<any>(null)

  const tabQuery = useReferenceDataTab(activeTab)
  const tabStatus = fromQuery(tabQuery)
  const data = (tabQuery.data ?? []) as unknown[]

  const specimenTypeIds =
    activeTab === 'specimen-types'
      ? (data as SpecimenType[]).map((st) => st.id)
      : []
  const containerTypesQuery = useSpecimenTypeContainerTypes(
    specimenTypeIds,
    activeTab === 'specimen-types' && tabQuery.isSuccess && specimenTypeIds.length > 0
  )
  const containerTypeRelationships = containerTypesQuery.relationships
  const containerTypeUsageInfo = containerTypesQuery.usageInfo

  // Close the form when the tab changes (adjust during render)
  const prevTabRef = useRef(activeTab)
  const searchInputRef = useRef<HTMLInputElement>(null)
  useFocusSearchOnSlash(searchInputRef)

  if (prevTabRef.current !== activeTab) {
    prevTabRef.current = activeTab
    setEditingItem(null)
  }

  const handleToggleContainerType = async (specimenTypeId: number, containerType: string, isAdding: boolean) => {
    // Block non-admin users from toggling
    if (!isAdmin) {
      return
    }

    try {
      if (isAdding) {
        await specimenTypesApi.addContainerType(specimenTypeId, containerType)
      } else {
        await specimenTypesApi.removeContainerType(specimenTypeId, containerType)
      }
    } finally {
      // Refetch on failure too, so the toggle shows what the server saved. ContainerTypeToggle shows the error.
      void invalidateAfterReferenceDataWrite(queryClient)
    }
  }

  const handleSave = async (saveData: any) => {
    try {
      if (editingItem?.id) {
        if (config.update) {
          await config.update(editingItem.id, saveData)
        }
      } else {
        if (config.create) {
          await config.create(saveData)
        }
      }
      setEditingItem(null)
      void invalidateAfterReferenceDataWrite(queryClient)
    } catch (error: any) {
      throw error
    }
  }

  const handleDelete = async (id: number) => {
    if (config.delete) {
      await config.delete(id)
      void invalidateAfterReferenceDataWrite(queryClient, { type: activeTab, id })
    }
  }

  const getColumns = () => {
    const deps: Record<string, unknown> = {}
    // Add container type relationships for specimen types
    if (activeTab === 'specimen-types') {
      deps.containerTypeRelationships = containerTypeRelationships
      deps.containerTypeUsageInfo = containerTypeUsageInfo
      deps.onToggleContainerType = isAdmin ? handleToggleContainerType : undefined
      deps.containerTypesDisabled = !isAdmin
    }
    return config.getColumns(deps)
  }

  const getFormFields = () => {
    // Pass editingItem as both the editing item and initial form data
    // The form component will manage its own formData state, but this gives
    // getFormFields the initial values to compute conditional fields
    const deps: any = {}
    if (activeTab === 'specimen-types') {
      deps.containerTypeRelationships = containerTypeRelationships
      deps.containerTypeUsageInfo = containerTypeUsageInfo
      deps.onToggleContainerType = isAdmin ? handleToggleContainerType : undefined
      deps.containerTypesDisabled = !isAdmin
    }
    return config.getFormFields(editingItem, editingItem, deps)
  }

  const getTitle = () => {
    // Add New opens the form with an empty item, which has no id.
    return editingItem?.id != null ? `Edit ${config.label}` : `Add ${config.label}`
  }

  return (
    <div className="reference-data-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="mb-6 ref-data-reveal ref-data-reveal-1">
          <h1 className="text-3xl font-bold">Reference Data Management</h1>
          <p className="text-sm text-app-text-muted mt-1 ref-data-description">
            Manage static lookup tables and reference data used throughout the system.
            {' '}
            <a href="/docs/guides/reference-data/overview/" className="text-app-accent hover:text-app-accent-hover hover:underline">
              Reference data guide
            </a>
          </p>
        </div>

        <div className="ref-data-card ref-data-reveal ref-data-reveal-2">
          <div className="border-b border-app-border">
            <nav className="flex -mb-px">
              {referenceDataConfigs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id)
                    setEditingItem(null)
                  }}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ref-data-tab ${activeTab === tab.id ? 'ref-data-tab-active border-b-2' : 'border-transparent'}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {tabStatus === 'error' && (
              <PageError
                title={`Could not load ${config.label}`}
                message={getQueryErrorMessage(tabQuery.error, 'Failed to load reference data')}
                onRetry={() => void tabQuery.refetch()}
              />
            )}

            {!canManageReferenceData && (
              <div className="mb-4 rounded-md ref-data-notice p-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium">
                    {canAdd
                      ? 'You can add tags. Contact an administrator to rename or delete a tag.'
                      : 'Reference data is view-only. Contact an administrator to add or modify reference data.'}
                  </p>
                </div>
              </div>
            )}

          <div className="mb-4 flex justify-end">
            {canAdd && (
              <button
                onClick={() => setEditingItem({})}
                className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover"
              >
                Add New
              </button>
            )}
          </div>

          <ReferenceDataTable
            data={data}
            columns={getColumns()}
            onEdit={setEditingItem}
            onDelete={handleDelete}
            searchPlaceholder={`Search ${config.label}...`}
            emptyMessage={`No ${config.label} found`}
            loading={tabQuery.isPending}
            readOnly={!canManageReferenceData}
            searchInputRef={searchInputRef}
          />
          </div>
        </div>

        {editingItem !== null && (canManageReferenceData || (canAdd && !editingItem.id)) && (
          <ReferenceDataForm
            key={editingItem?.id ?? 'new'}
            item={editingItem}
            fields={getFormFields()}
            onSave={handleSave}
            onCancel={() => setEditingItem(null)}
            title={getTitle()}
            modalClassName="reference-data-form-modal"
          />
        )}
      </div>
    </div>
  )
}

