import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { settingsApi, type AllSettings } from '../lib/api'
import { useUser } from '../contexts/UserContext'
import InfoTooltip from '../components/InfoTooltip'
import ContainerDefaultsForm from '../components/ContainerDefaultsForm'
import ContainerTypeUnitsManager from '../components/ContainerTypeUnitsManager'
import PaginationSettingsForm from '../components/PaginationSettingsForm'
import PasswordRequirementsForm from '../components/PasswordRequirementsForm'
import SessionSettingsForm from '../components/SessionSettingsForm'
import ExportConfigurationsManager from '../components/ExportConfigurationsManager'
import ScannerConfigurationsManager from '../components/ScannerConfigurationsManager'
import SkeletonCard from '../components/SkeletonCard'

type SettingsCategory = 'application' | 'security' | 'data-management'
type SettingsSection = 'container-defaults' | 'container-type-units' | 'pagination' | 'password' | 'session' | 'export-configurations' | 'scanner-configurations'

interface SettingsStructure {
  id: SettingsCategory
  label: string
  icon: React.ReactNode
  sections: Array<{
    id: SettingsSection
    label: string
    tooltip: string
    adminOnly?: boolean
  }>
}

const settingsStructure: SettingsStructure[] = [
  {
    id: 'application',
    label: 'Application Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    sections: [
      {
        id: 'container-defaults',
        label: 'Container Defaults',
        tooltip: 'Configure default quantity values used when creating new containers for each container type. Default units are managed in Container Type Units settings.',
        adminOnly: true,
      },
      {
        id: 'container-type-units',
        label: 'Container Type Units',
        tooltip: 'Manage which units are allowed for each container type and set the default unit for each type. Only allowed units can be used when creating or editing containers.',
        adminOnly: true,
      },
      {
        id: 'pagination',
        label: 'Pagination',
        tooltip: 'Configure how many items are displayed per page in list views',
      },
    ],
  },
  {
    id: 'security',
    label: 'Security Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    sections: [
      {
        id: 'password',
        label: 'Password Requirements',
        tooltip: 'Set password security requirements for user accounts',
        adminOnly: true,
      },
      {
        id: 'session',
        label: 'Session Settings',
        tooltip: 'Configure how long users remain logged in before requiring re-authentication',
        adminOnly: true,
      },
    ],
  },
  {
    id: 'data-management',
    label: 'Data Management',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    sections: [
      {
        id: 'export-configurations',
        label: 'Export Configurations',
        tooltip: 'Create and manage multiple named export configurations for different export scenarios',
      },
      {
        id: 'scanner-configurations',
        label: 'Scanner Configurations',
        tooltip: 'Create and manage scanner configurations for parsing CSV files from different plate scanning devices',
      },
    ],
  },
]

export default function Settings() {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  
  // Filter settings structure based on user role
  const filteredSettingsStructure = useMemo(() => {
    if (isAdmin) {
      return settingsStructure
    }
    // For non-admins, filter out admin-only sections
    return settingsStructure.map(category => ({
      ...category,
      sections: category.sections.filter(section => !section.adminOnly),
    })).filter(category => category.sections.length > 0) // Remove categories with no visible sections
  }, [isAdmin])
  
  const categoryParam = searchParams.get('category') as SettingsCategory | null
  const sectionParam = searchParams.get('section') as SettingsSection | null
  
  // Get initial category and section based on filtered structure
  const getInitialCategoryAndSection = useCallback((): { category: SettingsCategory; section: SettingsSection } => {
    // Use new params if available
    if (categoryParam && sectionParam) {
      // Validate that the section belongs to the category and is accessible
      const category = filteredSettingsStructure.find(c => c.id === categoryParam)
      if (category && category.sections.some(s => s.id === sectionParam)) {
        return { category: categoryParam, section: sectionParam }
      }
    }
    
    // Default to first section of first category
    if (filteredSettingsStructure.length > 0 && filteredSettingsStructure[0].sections.length > 0) {
      return {
        category: filteredSettingsStructure[0].id,
        section: filteredSettingsStructure[0].sections[0].id,
      }
    }
    
    // Fallback (shouldn't happen, but TypeScript needs it)
    return {
      category: 'data-management',
      section: 'export-configurations',
    }
  }, [filteredSettingsStructure, categoryParam, sectionParam])

  const initial = useMemo(() => getInitialCategoryAndSection(), [getInitialCategoryAndSection])
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initial.category)
  const [activeSection, setActiveSection] = useState<SettingsSection>(initial.section)
  const [expandedCategories, setExpandedCategories] = useState<Set<SettingsCategory>>(
    new Set([initial.category])
  )
  const prevParamsRef = useRef({ category: categoryParam, section: sectionParam })

  // Update active category/section when URL params change (adjust during render)
  const category = searchParams.get('category') as SettingsCategory | null
  const section = searchParams.get('section') as SettingsSection | null
  if (category !== prevParamsRef.current.category || section !== prevParamsRef.current.section) {
    prevParamsRef.current = { category, section }
    if (category && section) {
      const categoryData = filteredSettingsStructure.find(c => c.id === category)
      if (categoryData && categoryData.sections.some(s => s.id === section)) {
        setActiveCategory(category)
        setActiveSection(section)
        setExpandedCategories(prev => new Set([...prev, category]))
      } else {
        const initialSection = getInitialCategoryAndSection()
        setSearchParams({ category: initialSection.category, section: initialSection.section }, { replace: true })
      }
    }
  }

  const handleSectionChange = (category: SettingsCategory, section: SettingsSection) => {
    setActiveCategory(category)
    setActiveSection(section)
    setExpandedCategories(prev => new Set([...prev, category]))
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('category', category)
      next.set('section', section)
      return next
    })
  }
  
  const toggleCategory = (category: SettingsCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [settings, setSettings] = useState<AllSettings | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await settingsApi.getAll()
      setSettings(res.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      // Each form component handles its own save
      setSuccess('Settings saved successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const renderForm = () => {
    if (!settings) return null
    
    switch (activeSection) {
      case 'container-defaults':
        return (
          <ContainerDefaultsForm
            data={settings.container_defaults}
            onSave={handleSave}
            onError={(err) => setError(err)}
            onSuccess={() => {
              setSuccess('Container defaults saved successfully')
              setTimeout(() => setSuccess(null), 3000)
              loadSettings()
            }}
          />
        )
      case 'container-type-units':
        return (
          <ContainerTypeUnitsManager
            onSave={handleSave}
            onError={(err) => setError(err)}
            onSuccess={() => {
              setSuccess('Container type units updated successfully')
              setTimeout(() => setSuccess(null), 3000)
            }}
          />
        )
      case 'pagination':
        return (
          <PaginationSettingsForm
            data={settings.pagination_settings}
            onSave={handleSave}
            onError={(err) => setError(err)}
            onSuccess={() => {
              setSuccess('Pagination settings saved successfully')
              setTimeout(() => setSuccess(null), 3000)
              loadSettings()
            }}
          />
        )
      case 'password':
        return (
          <PasswordRequirementsForm
            data={settings.password_requirements}
            onSave={handleSave}
            onError={(err) => setError(err)}
            onSuccess={() => {
              setSuccess('Password requirements saved successfully')
              setTimeout(() => setSuccess(null), 3000)
              loadSettings()
            }}
          />
        )
      case 'session':
        return (
          <SessionSettingsForm
            data={settings.session_settings}
            onSave={handleSave}
            onError={(err) => setError(err)}
            onSuccess={() => {
              setSuccess('Session settings saved successfully')
              setTimeout(() => setSuccess(null), 3000)
              loadSettings()
            }}
          />
        )
      case 'export-configurations':
        return (
          <ExportConfigurationsManager
            data={settings.export_configurations}
            onSave={handleSave}
            onError={(err) => setError(err)}
            onSuccess={() => {
              setSuccess('Export configurations saved successfully')
              setTimeout(() => setSuccess(null), 3000)
              loadSettings()
            }}
          />
        )
      case 'scanner-configurations':
        return (
          <ScannerConfigurationsManager
            data={settings.scanner_configurations}
            onSave={handleSave}
            onError={(err) => setError(err)}
            onSuccess={() => {
              setSuccess('Scanner configurations saved successfully')
              setTimeout(() => setSuccess(null), 3000)
              loadSettings()
            }}
          />
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-4">
        <div className="mb-3">
          <div className="h-8 bg-gray-200 rounded w-64 mb-2 animate-pulse"></div>
        </div>
        <div className="flex gap-6">
          <div className="w-60 bg-white rounded-lg shadow p-4">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <div className="h-5 bg-gray-200 rounded w-32 mb-2 animate-pulse"></div>
                  <div className="ml-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-28 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-white rounded-lg shadow p-4">
            <SkeletonCard height="h-96" />
          </div>
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-600">Failed to load settings</div>
      </div>
    )
  }

  const activeCategoryData = filteredSettingsStructure.find(c => c.id === activeCategory)
  const activeSectionData = activeCategoryData?.sections.find(s => s.id === activeSection)

  return (
    <div className="container mx-auto px-4 py-4">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">Application Settings</h1>
      </div>

      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2">
          <p className="text-xs font-medium text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-2 rounded-md bg-green-50 p-2">
          <p className="text-xs font-medium text-green-800">{success}</p>
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <aside className="w-60 flex-shrink-0">
          <div className="bg-white rounded-lg shadow border border-gray-200">
            <nav className="p-2">
              {filteredSettingsStructure.map((category) => {
                const isExpanded = expandedCategories.has(category.id)
                const isActiveCategory = activeCategory === category.id
                
                return (
                  <div key={category.id} className="mb-1">
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActiveCategory
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">{category.icon}</span>
                        <span>{category.label}</span>
                      </div>
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    
                    {/* Category Sections */}
                    {isExpanded && (
                      <div className="ml-4 mt-1 space-y-0.5">
                        {category.sections.map((section) => {
                          const isActive = activeCategory === category.id && activeSection === section.id
                          
                          return (
              <button
                              key={section.id}
                              onClick={() => handleSectionChange(category.id, section.id)}
                              className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-colors ${
                                isActive
                                  ? 'bg-blue-100 text-blue-700 border-l-2 border-blue-600'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <span>{section.label}</span>
                              <InfoTooltip text={section.tooltip} />
              </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
          </nav>
        </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-4">
              {activeSectionData && (
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">{activeSectionData.label}</h2>
                  <p className="text-xs text-gray-500 mt-1">{activeSectionData.tooltip}</p>
                </div>
              )}
              {renderForm()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

