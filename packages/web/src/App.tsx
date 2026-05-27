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
import CompositionDetail from './pages/CompositionDetail'
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
import { UserProvider, useUser } from './contexts/UserContext'
import { ThemeProvider, useTheme, THEME_IDS, THEME_LABELS } from './contexts/ThemeContext'
import { useClickOutside } from './hooks/useClickOutside'
import HotkeyHelpModal from './components/HotkeyHelpModal'
import CommandPalette from './components/CommandPalette'
import SearchModal from './components/SearchModal'
import { BuildVersionBanner } from './components/BuildVersionBanner'
import { ToastContainer } from './components/Toast'
import { useHotkey, useModifierHotkey, useModifierShiftHotkey } from './hooks/useHotkey'
import { useBrowserShortcutBlocker } from './hooks/useBrowserShortcutBlocker'
import { useCommands } from './lib/command-registry/registry'
import { formatHotkey, getModifierKey, isMac } from './lib/hotkeys'
import { useState, useRef, useEffect, useCallback } from 'react'
import { exportApi } from './lib/api/export';function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const { canWrite, isAdmin, canManageReferenceData, refreshUser } = useUser()
  const { theme, setTheme } = useTheme()
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const themeTriggerRef = useRef<HTMLButtonElement>(null)
  const themeOptionRefs = useRef<(HTMLButtonElement | null)[]>([])
  useClickOutside(themeMenuRef, () => setThemeMenuOpen(false), themeMenuOpen)

  useEffect(() => {
    if (themeMenuOpen) {
      const t = setTimeout(() => {
        const idx = THEME_IDS.indexOf(theme)
        const el = themeOptionRefs.current[idx]
        if (el) el.focus()
      }, 0)
      return () => clearTimeout(t)
    }
  }, [themeMenuOpen, theme])

  const handleThemeMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setThemeMenuOpen(false)
        themeTriggerRef.current?.focus()
        e.preventDefault()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const current = themeOptionRefs.current.findIndex((el) => el === document.activeElement)
        const next = current < 0 ? 0 : (current + 1) % THEME_IDS.length
        themeOptionRefs.current[next]?.focus()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const current = themeOptionRefs.current.findIndex((el) => el === document.activeElement)
        const next = current <= 0 ? THEME_IDS.length - 1 : current - 1
        themeOptionRefs.current[next]?.focus()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const current = themeOptionRefs.current.findIndex((el) => el === document.activeElement)
        if (current >= 0) {
          setTheme(THEME_IDS[current])
          setThemeMenuOpen(false)
          themeTriggerRef.current?.focus()
        }
      }
    },
    [setTheme]
  )
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
  const handleExportSpecimens = useCallback(async () => {
    try {
      const response = await exportApi.specimens()
      const blob = response as Blob
      const filename = `specimens_export_${formatLocalDateTime()}.csv`
      downloadBlob(blob, filename)
    } catch (error) {
      console.error('Failed to export specimens:', error)
      alert('Failed to export specimens. Please try again.')
    }
  }, [])

  // Helper function to export inventory
  const handleExportInventory = useCallback(async () => {
    try {
      const response = await exportApi.inventory()
      const blob = response as Blob
      const filename = `inventory_export_${formatLocalDateTime()}.csv`
      downloadBlob(blob, filename)
    } catch (error) {
      console.error('Failed to export inventory:', error)
      alert('Failed to export inventory. Please try again.')
    }
  }, [])

  // Helper function to clear filters based on current page
  const handleClearFilters = useCallback(() => {
    // Navigate to the same path but with empty search params to clear filters
    if (location.pathname === '/specimens' || location.pathname === '/studies' || location.pathname === '/statistics') {
      // Navigate to pathname with empty search string to explicitly clear all query parameters
      navigate({ pathname: location.pathname, search: '' }, { replace: true })
    }
  }, [navigate, location.pathname])

  const commands = useCommands({
    navigate,
    location,
    canWrite,
    isAdmin,
    canManageReferenceData,
    theme,
    setTheme,
    toggleHelpModal,
    openSearchModal,
    refreshUser,
    handleExportSpecimens,
    handleExportInventory,
    handleClearFilters,
  })

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
          <div className="min-h-screen bg-app-bg flex">
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
          <Route path="/blood-controls/compositions/:compositionKey" element={<CompositionDetail />} />
          <Route path="/blood-controls/compositions/:compositionKey/batches/new" element={<ControlBatchWizard />} />
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
          className={`floating-actions group fixed right-6 bottom-6 z-50 p-2 -m-2 ${isButtonsExpanded ? 'is-open' : ''}`}
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
            className="absolute right-full bottom-0 mr-1 floating-actions__expanded"
          >
            {/* User Switcher */}
            <div 
              className="floating-actions__dock-child transform transition-all duration-[220ms] ease-out"
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
              className="floating-actions__dock-child floating-actions__btn transition-all duration-[220ms] ease-out"
              style={{ 
                transitionDelay: isButtonsExpanded ? '50ms' : '0ms',
                opacity: isButtonsExpanded ? 1 : 0,
                transform: isButtonsExpanded ? 'translateX(0)' : 'translateX(8px)',
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
              className="floating-actions__dock-child floating-actions__btn transition-all duration-[220ms] ease-out"
              style={{
                transitionDelay: isButtonsExpanded ? '100ms' : '0ms',
                opacity: isButtonsExpanded ? 1 : 0,
                transform: isButtonsExpanded ? 'translateX(0)' : 'translateX(8px)',
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

            {/* Theme selector */}
            <div
              ref={themeMenuRef}
              className="floating-actions__dock-child floating-actions__theme-wrap transition-all duration-[220ms] ease-out"
              style={{
                transitionDelay: isButtonsExpanded ? '150ms' : '0ms',
                opacity: isButtonsExpanded ? 1 : 0,
                transform: isButtonsExpanded ? 'translateX(0)' : 'translateX(8px)',
              }}
            >
              <button
                ref={themeTriggerRef}
                type="button"
                onClick={() => setThemeMenuOpen((open) => !open)}
                className="floating-actions__btn transition-all duration-[220ms] ease-out"
                aria-label="Choose theme"
                aria-expanded={themeMenuOpen}
                aria-haspopup="listbox"
              >
                {theme === 'dark' ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : theme === 'sepia' ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                ) : theme === 'ocean' ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                ) : theme === 'warm-dark' ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.9 7.9 0 0120 13a7.9 7.9 0 01-2.343 5.657z" />
                  </svg>
                ) : theme === 'high-contrast' ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ) : theme === 'forest' ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 20l-5-10 5-10 5 10-5 10z" />
                  </svg>
                ) : theme === 'rose' ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                ) : (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
                <span className="floating-actions__kbd">{THEME_LABELS[theme]}</span>
              </button>
              {themeMenuOpen && (
                <div
                  className="floating-actions__theme-menu"
                  role="listbox"
                  aria-label="Theme"
                  onKeyDown={handleThemeMenuKeyDown}
                >
                  {THEME_IDS.map((id, index) => (
                    <button
                      key={id}
                      ref={(el) => {
                        themeOptionRefs.current[index] = el
                      }}
                      type="button"
                      role="option"
                      aria-selected={theme === id}
                      tabIndex={-1}
                      className="floating-actions__theme-option"
                      onClick={() => {
                        setTheme(id)
                        setThemeMenuOpen(false)
                      }}
                    >
                      {THEME_LABELS[id]}
                      {theme === id && (
                        <span className="floating-actions__theme-check" aria-hidden>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
        <ThemeProvider>
          <UserProvider>
            <BrowserRouter>
              <BuildVersionBanner />
              <AppContent />
            </BrowserRouter>
          </UserProvider>
        </ThemeProvider>
      </HotkeyProvider>
    </DateFilterProvider>
  )
}

export default App
