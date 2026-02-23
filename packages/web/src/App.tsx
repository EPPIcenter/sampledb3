import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { formatLocalDateTime } from './lib/date-utils'
import Dashboard from './pages/Dashboard'
import Setup from './pages/Setup'
import Login from './pages/Login'
import Register from './pages/Register'
import Studies from './pages/Studies'
import StudyDetail from './pages/StudyDetail'
import StudyImport from './pages/StudyImport'
import SubjectDetail from './pages/SubjectDetail'
import Specimens from './pages/Specimens'
import Statistics from './pages/Statistics'
import SpecimenDetail from './pages/SpecimenDetail'
import ContainerDetail from './pages/ContainerDetail'
import Locations from './pages/Locations'
import LocationDetail from './pages/LocationDetail'
import Collections from './pages/Collections'
import Import from './pages/Import'
import Export from './pages/Export'
import BarcodeExport from './pages/BarcodeExport'
import ContainerMoveMicronix from './pages/ContainerMoveMicronix'
import ContainerMoveCryovial from './pages/ContainerMoveCryovial'
import ContainerMovePapers from './pages/ContainerMovePapers'
import CollectionMove from './pages/CollectionMove'
import PlateScanValidation from './pages/PlateScanValidation'
import Sidebar from './components/Sidebar'
import './styles/sidebar.css'
import './styles/floating-palettes.css'
import UserSwitcher from './components/UserSwitcher'
import StudyNew from './pages/StudyNew'
import SpecimenNew from './pages/SpecimenNew'
import MicronixPlateDetail from './pages/MicronixPlateDetail'
import CryovialBoxDetail from './pages/CryovialBoxDetail'
import BoxDetail from './pages/BoxDetail'
import BagDetail from './pages/BagDetail'
import SheetDetail from './pages/SheetDetail'
import ControlBatchDetail from './pages/ControlBatchDetail'
import ControlBatchWizard from './pages/ControlBatchWizard'
import ControlDefinitionDetail from './pages/ControlDefinitionDetail'
import BloodControls from './pages/BloodControls'
import BloodControlDefinitionPage from './pages/BloodControlDefinitionPage'
import ReferenceData from './pages/ReferenceData'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Derivations from './pages/Derivations'
import DerivationsBulkImport from './pages/DerivationsBulkImport'
import QpcrExperiments from './pages/QpcrExperiments'
import QpcrExperimentNew from './pages/QpcrExperimentNew'
import QpcrExperimentDetail from './pages/QpcrExperimentDetail'
import AdminDashboard from './pages/AdminDashboard'
import AdminUsers from './pages/AdminUsers'
import AdminSettings from './pages/AdminSettings'
import AdminStatistics from './pages/AdminStatistics'
import AdminErrorLogs from './pages/AdminErrorLogs'
import AdminDataIntegrityLayout from './pages/AdminDataIntegrityLayout'
import AdminDataIntegrityOverview from './pages/AdminDataIntegrityOverview'
import AdminDataIntegrityEmptyCollections from './pages/AdminDataIntegrityEmptyCollections'
import AdminDataIntegrityReport from './pages/AdminDataIntegrityReport'
import SetupGuard from './components/SetupGuard'
import AuthGuard from './components/AuthGuard'
import AdminGuard from './components/AdminGuard'
import { DateFilterProvider } from './contexts/DateFilterContext'
import { HotkeyProvider, useHotkeyContext } from './contexts/HotkeyContext'
import { UserProvider } from './contexts/UserContext'
import HotkeyHelpModal from './components/HotkeyHelpModal'
import CommandPalette from './components/CommandPalette'
import SearchModal from './components/SearchModal'
import { ToastContainer } from './components/Toast'
import { useHotkey, useModifierHotkey, useModifierShiftHotkey } from './hooks/useHotkey'
import { useBrowserShortcutBlocker } from './hooks/useBrowserShortcutBlocker'
import { Command } from './lib/commands'
import { formatHotkey, getModifierKey, isMac } from './lib/hotkeys'
import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { exportApi } from './lib/api'
import { useUser } from './contexts/UserContext'
function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const { canWrite, isAdmin } = useUser()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const {
    isHelpModalOpen,
    toggleHelpModal,
    isSearchModalOpen,
    openSearchModal,
    closeSearchModal,
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
  } = useHotkeyContext()
  const [isButtonsExpanded, setIsButtonsExpanded] = useState(false)
  const collapseTimeoutRef = useRef<number | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current)
      }
    }
  }, [])

  // Attempt to block some browser shortcuts (note: critical shortcuts like Cmd+W, Cmd+N, Cmd+T
  // cannot be blocked by JavaScript for security reasons - browsers prevent this)
  useBrowserShortcutBlocker(true)

  // Helper function to download a blob as a file
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  // Helper function to export specimens
  const handleExportSpecimens = async () => {
    try {
      const response = await exportApi.specimens()
      const blob = response.data as Blob
      const filename = `specimens_export_${formatLocalDateTime()}.csv`
      downloadBlob(blob, filename)
    } catch (error) {
      console.error('Failed to export specimens:', error)
      alert('Failed to export specimens. Please try again.')
    }
  }

  // Helper function to export inventory
  const handleExportInventory = async () => {
    try {
      const response = await exportApi.inventory()
      const blob = response.data as Blob
      const filename = `inventory_export_${formatLocalDateTime()}.csv`
      downloadBlob(blob, filename)
    } catch (error) {
      console.error('Failed to export inventory:', error)
      alert('Failed to export inventory. Please try again.')
    }
  }

  // Helper function to clear filters based on current page
  const handleClearFilters = useCallback(() => {
    // Navigate to the same path but with empty search params to clear filters
    if (location.pathname === '/specimens' || location.pathname === '/studies' || location.pathname === '/statistics') {
      // Navigate to pathname with empty search string to explicitly clear all query parameters
      navigate({ pathname: location.pathname, search: '' }, { replace: true })
    }
  }, [navigate, location.pathname])

  // Build commands based on current route
  const commands = useMemo<Command[]>(() => {
    const baseCommands: Command[] = [
      // Navigation commands (available everywhere)
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        category: 'Navigation',
        keywords: ['dashboard', 'home', 'main'],
        action: () => navigate('/'),
      },
      {
        id: 'nav-studies',
        label: 'Go to Studies',
        category: 'Navigation',
        keywords: ['studies', 'study'],
        action: () => navigate('/studies'),
      },
      {
        id: 'nav-specimens',
        label: 'Go to Specimens',
        category: 'Navigation',
        keywords: ['specimens', 'specimen'],
        action: () => navigate('/specimens'),
      },
      {
        id: 'nav-statistics',
        label: 'Go to Statistics',
        category: 'Navigation',
        keywords: ['statistics', 'stats'],
        action: () => navigate('/statistics'),
      },
      {
        id: 'nav-locations',
        label: 'Go to Locations',
        category: 'Navigation',
        keywords: ['locations', 'location'],
        action: () => navigate('/locations'),
      },
      {
        id: 'nav-collections',
        label: 'Go to Collections',
        category: 'Navigation',
        keywords: ['collections', 'collection', 'plates', 'boxes', 'bags'],
        action: () => navigate('/collections'),
      },
      ...(canWrite ? [{
        id: 'nav-import',
        label: 'Go to Import',
        category: 'Navigation',
        keywords: ['import'],
        action: () => navigate('/import'),
      }] : []),
      {
        id: 'nav-controls',
        label: 'Go to Blood Controls',
        category: 'Navigation',
        keywords: ['controls', 'control', 'blood controls'],
        action: () => navigate('/blood-controls'),
      },
      {
        id: 'nav-derivations',
        label: 'Go to Derivations',
        category: 'Navigation',
        keywords: ['derivations', 'derivation'],
        action: () => navigate('/derivations'),
      },
      {
        id: 'nav-profile',
        label: 'Go to My Profile',
        category: 'Navigation',
        keywords: ['profile', 'my profile', 'account'],
        action: () => navigate('/profile'),
      },
      {
        id: 'nav-settings',
        label: 'Go to Application Settings',
        category: 'Navigation',
        keywords: ['settings', 'setting', 'application'],
        action: () => navigate('/settings'),
      },
      {
        id: 'nav-reference-data',
        label: 'Go to Reference Data',
        category: 'Navigation',
        keywords: ['reference data', 'reference'],
        action: () => navigate('/reference-data'),
      },
      {
        id: 'nav-docs',
        label: 'Open Documentation',
        category: 'Navigation',
        keywords: ['documentation', 'docs', 'help', 'guide', 'manual'],
        action: () => { window.location.href = '/docs' },
      },
      // Export commands
      {
        id: 'export-barcodes',
        label: 'Export by Barcodes',
        category: 'Export',
        keywords: ['barcode', 'export', 'scan'],
        action: () => navigate('/barcode-export'),
      },
      {
        id: 'export-specimens',
        label: 'Export Specimens',
        category: 'Export',
        keywords: ['export specimens', 'specimen csv', 'download specimens'],
        action: handleExportSpecimens,
      },
      {
        id: 'export-inventory',
        label: 'Export Inventory',
        category: 'Export',
        keywords: ['export inventory', 'inventory csv', 'download inventory'],
        action: handleExportInventory,
      },
      // Bulk Operations commands
      ...(canWrite ? [
        {
          id: 'move-micronix',
          label: 'Move Micronix Containers',
          category: 'Bulk Operations',
          keywords: ['move micronix', 'container move micronix'],
          action: () => navigate('/container-move/micronix'),
        },
        {
          id: 'move-cryovial',
          label: 'Move Cryovial Containers',
          category: 'Bulk Operations',
          keywords: ['move cryovial', 'container move cryovial'],
          action: () => navigate('/container-move/cryovial'),
        },
        {
          id: 'move-papers',
          label: 'Move Papers',
          category: 'Bulk Operations',
          keywords: ['move papers', 'container move papers'],
          action: () => navigate('/container-move/papers'),
        },
        {
          id: 'move-collections',
          label: 'Move Collections',
          category: 'Bulk Operations',
          keywords: ['move collections', 'collection move'],
          action: () => navigate('/collection-move'),
        },
      ] : []),
      // Actions commands
      {
        id: 'open-search',
        label: 'Open Search',
        category: 'Actions',
        keywords: ['search', 'find', 'lookup'],
        action: () => openSearchModal(),
      },
      // Admin Navigation commands (conditional on admin role)
      ...(isAdmin ? [
        {
          id: 'nav-admin-dashboard',
          label: 'Go to Admin Dashboard',
          category: 'Navigation',
          keywords: ['admin', 'dashboard', 'admin dashboard'],
          action: () => navigate('/admin'),
        },
        {
          id: 'nav-admin-users',
          label: 'Go to User Management',
          category: 'Navigation',
          keywords: ['admin', 'users', 'user management', 'manage users'],
          action: () => navigate('/admin/users'),
        },
        {
          id: 'nav-admin-settings',
          label: 'Go to System Settings',
          category: 'Navigation',
          keywords: ['admin', 'system settings', 'admin settings'],
          action: () => navigate('/admin/settings'),
        },
        {
          id: 'nav-admin-statistics',
          label: 'Go to System Statistics',
          category: 'Navigation',
          keywords: ['admin', 'system statistics', 'admin statistics'],
          action: () => navigate('/admin/statistics'),
        },
        {
          id: 'nav-admin-error-logs',
          label: 'Go to Error Logs',
          category: 'Navigation',
          keywords: ['admin', 'error logs', 'logs', 'errors'],
          action: () => navigate('/admin/error-logs'),
        },
        {
          id: 'create-location',
          label: 'Create Location',
          category: 'Create',
          keywords: ['create location', 'add location', 'new location'],
          action: () => navigate('/locations'),
        },
      ] : []),
    ]

    // Context-specific commands
    const contextCommands: Command[] = []

    // Create commands available on Dashboard, Studies page, or Study Detail
    if (
      location.pathname === '/' ||
      location.pathname === '/studies' ||
      location.pathname.startsWith('/studies/')
    ) {
      contextCommands.push({
        id: 'create-study',
        label: 'Create New Study',
        category: 'Create',
        keywords: ['new study', 'create study', 'add study'],
        action: () => navigate('/studies/new'),
        context: ['/', '/studies'],
      })
    }

    // Create commands available on Dashboard, Specimens page, or Subject Detail
    if (
      location.pathname === '/' ||
      location.pathname === '/specimens' ||
      location.pathname.startsWith('/subjects/')
    ) {
      contextCommands.push({
        id: 'create-specimen',
        label: 'Create New Specimen',
        category: 'Create',
        keywords: ['new specimen', 'create specimen', 'add specimen'],
        action: () => navigate('/specimens/new'),
        context: ['/', '/specimens'],
      })
    }

    // Create subject command on Study Detail page
    if (location.pathname.startsWith('/studies/') && !location.pathname.endsWith('/new')) {
      const studyId = location.pathname.split('/')[2]
      contextCommands.push({
        id: 'create-subject',
        label: 'Create New Subject',
        category: 'Create',
        keywords: ['new subject', 'create subject', 'add subject'],
        action: () => {
          // Navigate to study detail with query param to trigger subject creation modal
          navigate(`/studies/${studyId}?createSubject=true`)
        },
        context: [`/studies/${studyId}`],
      })
    }

    // Create specimen command on Subject Detail page
    if (location.pathname.startsWith('/subjects/')) {
      const subjectId = location.pathname.split('/')[2]
      contextCommands.push({
        id: 'create-specimen-subject',
        label: 'Create New Specimen for Subject',
        category: 'Create',
        keywords: ['new specimen', 'create specimen', 'add specimen'],
        action: () => {
          // Navigate to subject detail with query param to trigger specimen creation modal
          navigate(`/subjects/${subjectId}?createSpecimen=true`)
        },
        context: [`/subjects/${subjectId}`],
      })
    }

    // Export Current Study command on Study Detail page
    if (location.pathname.startsWith('/studies/') && !location.pathname.endsWith('/new')) {
      const studyId = location.pathname.split('/')[2]
      contextCommands.push({
        id: 'export-current-study',
        label: 'Export Current Study',
        category: 'Export',
        keywords: ['export', 'download', 'csv', 'excel', 'export study'],
        action: () => {
          navigate(`/export?study=${studyId}`)
        },
        context: [`/studies/${studyId}`],
      })
    }

    // Clear Filters command (context-specific, only show when filters are active)
    if (
      location.pathname === '/specimens' ||
      location.pathname === '/studies' ||
      location.pathname === '/statistics'
    ) {
      // Check if there are active filters in URL params
      const hasActiveFilters = location.search && location.search.length > 0
      if (hasActiveFilters) {
        contextCommands.push({
          id: 'clear-filters',
          label: 'Clear Filters',
          category: 'Actions',
          keywords: ['clear filters', 'reset filters', 'remove filters'],
          action: handleClearFilters,
          context: ['/specimens', '/studies', '/statistics'],
        })
      }
    }

    return [...baseCommands, ...contextCommands]
  }, [navigate, location.pathname, location.search, openSearchModal, canWrite, isAdmin, handleClearFilters])

  // Command palette (cmd+shift+k)
  useModifierShiftHotkey('k', () => {
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return // Don't interfere if user is typing
    }
    openCommandPalette()
  }, { preventDefault: true })

  // Search modal (cmd+k / ctrl+k)
  useModifierHotkey('k', () => {
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return // Allow default behavior if typing in an input
    }
    openSearchModal()
  }, { preventDefault: true })

  // Help modal toggle
  useHotkey('?', () => toggleHelpModal(), { preventDefault: true })
  
  const isLoginPage = location.pathname === '/login'
  const isSetupPage = location.pathname === '/setup'
  const isRegisterPage = location.pathname === '/register'

  return (
    <SetupGuard>
      {!isLoginPage && !isSetupPage && !isRegisterPage ? (
        <AuthGuard>
          <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <Sidebar
              isMobileOpen={isMobileSidebarOpen}
              onMobileClose={() => setIsMobileSidebarOpen(false)}
            />

            {/* Main content area */}
            <div className="flex-1 flex flex-col lg:ml-52 min-w-0">
              {/* Mobile menu button - floating */}
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="app-sidebar__mobile-trigger fixed top-4 left-4 z-50"
                aria-label="Open menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Page content */}
              <main className="flex-1 overflow-auto">
                <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/studies" element={<Studies />} />
          <Route path="/studies/new" element={<StudyNew />} />
          <Route path="/studies/:id/import" element={<StudyImport />} />
          <Route path="/studies/:id" element={<StudyDetail />} />
          <Route path="/subjects/:id" element={<SubjectDetail />} />
          <Route path="/specimens" element={<Specimens />} />
          <Route path="/specimens/new" element={<SpecimenNew />} />
          <Route path="/specimens/:id" element={<SpecimenDetail />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/containers/:id" element={<ContainerDetail />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/locations/:id" element={<LocationDetail />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/import" element={<Import />} />
          <Route path="/export" element={<Export />} />
          <Route path="/barcode-export" element={<BarcodeExport />} />
          <Route path="/container-move/micronix" element={<ContainerMoveMicronix />} />
          <Route path="/container-move/cryovial" element={<ContainerMoveCryovial />} />
          <Route path="/container-move/papers" element={<ContainerMovePapers />} />
          <Route path="/collection-move" element={<CollectionMove />} />
          <Route path="/plate-scan-validation" element={<PlateScanValidation />} />
          <Route path="/collections/micronix-plates/:id" element={<MicronixPlateDetail />} />
          <Route path="/collections/cryovial-boxes/:id" element={<CryovialBoxDetail />} />
          <Route path="/collections/boxes/:id" element={<BoxDetail />} />
          <Route path="/collections/bags/:id" element={<BagDetail />} />
          <Route path="/collections/sheets/:id" element={<SheetDetail />} />
          <Route path="/blood-controls" element={<BloodControls />} />
          <Route path="/blood-controls/new" element={<BloodControlDefinitionPage />} />
          <Route path="/blood-controls/:definitionId/batches/new" element={<ControlBatchWizard />} />
          <Route path="/blood-controls/:id" element={<ControlDefinitionDetail />} />
          <Route path="/blood-controls/:id/edit" element={<BloodControlDefinitionPage />} />
          <Route path="/blood-controls/batches/new" element={<Navigate to="/blood-controls?tab=definitions" replace />} />
          <Route path="/blood-controls/batches/:id" element={<ControlBatchDetail />} />
          <Route path="/blood-controls/batches/:id/add-specimens" element={<ControlBatchWizard />} />
              <Route path="/reference-data" element={<ReferenceData />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/derivations" element={<Derivations />} />
              <Route path="/derivations/import" element={<DerivationsBulkImport />} />
              <Route path="/qpcr-experiments" element={<QpcrExperiments />} />
              <Route path="/qpcr-experiments/new" element={<QpcrExperimentNew />} />
              <Route path="/qpcr-experiments/:id" element={<QpcrExperimentDetail />} />
              {/* Admin routes */}
              <Route
                path="/admin"
                element={
                  <AdminGuard>
                    <AdminDashboard />
                  </AdminGuard>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <AdminGuard>
                    <AdminUsers />
                  </AdminGuard>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <AdminGuard>
                    <AdminSettings />
                  </AdminGuard>
                }
              />
              <Route
                path="/admin/statistics"
                element={
                  <AdminGuard>
                    <AdminStatistics />
                  </AdminGuard>
                }
              />
              <Route
                path="/admin/error-logs"
                element={
                  <AdminGuard>
                    <AdminErrorLogs />
                  </AdminGuard>
                }
              />
              <Route
                path="/admin/data-integrity"
                element={
                  <AdminGuard>
                    <AdminDataIntegrityLayout />
                  </AdminGuard>
                }
              >
                <Route index element={<AdminDataIntegrityOverview />} />
                <Route path="empty-collections" element={<AdminDataIntegrityEmptyCollections />} />
                <Route path="report" element={<AdminDataIntegrityReport />} />
              </Route>
                </Routes>
              </main>
            </div>
          </div>
        </AuthGuard>
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/setup" element={<Setup />} />
        </Routes>
      )}

      {/* Floating action buttons - only show when authenticated */}
      {!isLoginPage && !isSetupPage && !isRegisterPage && (
        <div 
          data-floating-buttons="true"
          className="floating-actions group fixed right-6 bottom-6 z-50 p-2 -m-2"
          onMouseEnter={() => {
            // Clear any pending collapse
            if (collapseTimeoutRef.current) {
              clearTimeout(collapseTimeoutRef.current)
              collapseTimeoutRef.current = null
            }
            setIsButtonsExpanded(true)
          }}
          onMouseLeave={() => {
            // Add a delay before collapsing to allow mouse movement to expanded buttons
            collapseTimeoutRef.current = setTimeout(() => {
              setIsButtonsExpanded(false)
              collapseTimeoutRef.current = null
            }, 300) // 300ms delay before collapsing
          }}
        >
          {/* Collapsed indicator button - always visible */}
          <button
            type="button"
            className="floating-actions__trigger"
            aria-label="Show actions"
            aria-expanded={isButtonsExpanded}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {/* Expanded buttons - visible on hover, positioned to the left */}
          <div 
            className={`absolute right-full bottom-0 mr-1 floating-actions__expanded transition-all duration-300 ease-out ${
              isButtonsExpanded 
                ? 'opacity-100 translate-x-0 pointer-events-auto' 
                : 'opacity-0 translate-x-2 pointer-events-none'
            }`}
          >
            {/* User Switcher */}
            <div 
              className="transform transition-all duration-300"
              style={{ 
                transitionDelay: isButtonsExpanded ? '0ms' : '0ms',
                opacity: isButtonsExpanded ? 1 : 0,
                transform: isButtonsExpanded ? 'translateX(0)' : 'translateX(8px)'
              }}
            >
              <UserSwitcher />
            </div>

            {/* Command palette button */}
            <button
              type="button"
              onClick={openCommandPalette}
              className="floating-actions__btn"
              style={{ 
                transitionDelay: isButtonsExpanded ? '50ms' : '0ms',
                opacity: isButtonsExpanded ? 1 : 0,
                transform: isButtonsExpanded ? 'translateX(0)' : 'translateX(8px)'
              }}
              aria-label="Open command palette"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span className="floating-actions__kbd">
                {isMac() ? '⌘⇧K' : 'Ctrl+Shift+K'}
              </span>
            </button>

            {/* Search button */}
            <button
              type="button"
              onClick={openSearchModal}
              className="floating-actions__btn"
              style={{ 
                transitionDelay: isButtonsExpanded ? '100ms' : '0ms',
                opacity: isButtonsExpanded ? 1 : 0,
                transform: isButtonsExpanded ? 'translateX(0)' : 'translateX(8px)'
              }}
              aria-label="Open search"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="floating-actions__kbd">
                {isMac() ? '⌘K' : 'Ctrl+K'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Modals - only show when authenticated */}
      {!isLoginPage && !isSetupPage && !isRegisterPage && (
        <>
          <HotkeyHelpModal isOpen={isHelpModalOpen} onClose={toggleHelpModal} />
          <SearchModal isOpen={isSearchModalOpen} onClose={closeSearchModal} />
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={closeCommandPalette}
            commands={commands}
          />
        </>
      )}
      <ToastContainer />
    </SetupGuard>
  )
}

function App() {
  return (
    <DateFilterProvider>
      <HotkeyProvider>
        <UserProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </UserProvider>
      </HotkeyProvider>
    </DateFilterProvider>
  )
}

export default App
