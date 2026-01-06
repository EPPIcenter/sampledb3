import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Setup from './pages/Setup'
import Studies from './pages/Studies'
import StudyDetail from './pages/StudyDetail'
import SubjectDetail from './pages/SubjectDetail'
import Specimens from './pages/Specimens'
import Statistics from './pages/Statistics'
import SpecimenDetail from './pages/SpecimenDetail'
import ContainerDetail from './pages/ContainerDetail'
import Locations from './pages/Locations'
import LocationDetail from './pages/LocationDetail'
import Import from './pages/Import'
import Export from './pages/Export'
import BarcodeExport from './pages/BarcodeExport'
import ContainerMoveMicronix from './pages/ContainerMoveMicronix'
import ContainerMoveCryovial from './pages/ContainerMoveCryovial'
import ContainerMovePapers from './pages/ContainerMovePapers'
import CollectionMove from './pages/CollectionMove'
import Sidebar from './components/Sidebar'
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
import ControlDefinitionForm from './components/forms/ControlDefinitionForm'
import ReferenceData from './pages/ReferenceData'
import Settings from './pages/Settings'
import Derivations from './pages/Derivations'
import DerivationsImport from './pages/DerivationsImport'
import SetupGuard from './components/SetupGuard'
import { DateFilterProvider } from './contexts/DateFilterContext'
import { HotkeyProvider, useHotkeyContext } from './contexts/HotkeyContext'
import HotkeyHelpModal from './components/HotkeyHelpModal'
import CommandPalette from './components/CommandPalette'
import SearchModal from './components/SearchModal'
import { useHotkey, useModifierHotkey, useModifierShiftHotkey } from './hooks/useHotkey'
import { useBrowserShortcutBlocker } from './hooks/useBrowserShortcutBlocker'
import { useFloatingButtonsPosition } from './hooks/useFloatingButtonsPosition'
import { Command } from './lib/commands'
import { formatHotkey, getModifierKey, isMac } from './lib/hotkeys'
import { useMemo, useState, useRef, useEffect } from 'react'
import { exportApi } from './lib/api'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
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
  const shouldButtonsBeAtTop = useFloatingButtonsPosition()
  const buttonsRef = useRef<HTMLDivElement>(null)
  const [buttonsHeight, setButtonsHeight] = useState(120) // Default estimate

  // Measure actual height of buttons for accurate positioning
  useEffect(() => {
    if (buttonsRef.current) {
      const height = buttonsRef.current.offsetHeight
      setButtonsHeight(height)
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
      const filename = `specimens_export_${Date.now()}.csv`
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
      const filename = `inventory_export_${Date.now()}.csv`
      downloadBlob(blob, filename)
    } catch (error) {
      console.error('Failed to export inventory:', error)
      alert('Failed to export inventory. Please try again.')
    }
  }

  // Helper function to clear filters based on current page
  const handleClearFilters = () => {
    if (location.pathname === '/specimens') {
      navigate('/specimens')
    } else if (location.pathname === '/studies') {
      navigate('/studies')
    } else if (location.pathname === '/statistics') {
      navigate('/statistics')
    }
  }

  // Helper function to refresh current page
  const handleRefreshPage = () => {
    window.location.reload()
  }

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
        id: 'nav-import',
        label: 'Go to Import',
        category: 'Navigation',
        keywords: ['import'],
        action: () => navigate('/import'),
      },
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
      // Quick Actions commands
      {
        id: 'open-search',
        label: 'Open Search',
        category: 'Quick Actions',
        keywords: ['search', 'find', 'lookup'],
        action: () => openSearchModal(),
      },
      {
        id: 'view-statistics',
        label: 'View Statistics',
        category: 'Quick Actions',
        keywords: ['statistics', 'stats', 'analytics', 'charts'],
        action: () => navigate('/statistics'),
      },
      {
        id: 'view-reference-data',
        label: 'View Reference Data',
        category: 'Quick Actions',
        keywords: ['reference data', 'reference', 'config', 'settings reference'],
        action: () => navigate('/reference-data'),
      },
      {
        id: 'import-data',
        label: 'Import Data',
        category: 'Quick Actions',
        keywords: ['import', 'upload', 'import data'],
        action: () => navigate('/import'),
      },
      // Data Management commands
      {
        id: 'view-locations',
        label: 'View All Locations',
        category: 'Data Management',
        keywords: ['locations', 'storage', 'location'],
        action: () => navigate('/locations'),
      },
      // Advanced Navigation (already have controls, but adding setup)
      {
        id: 'go-to-setup',
        label: 'Go to Setup',
        category: 'Navigation',
        keywords: ['setup', 'initial setup', 'configure'],
        action: () => navigate('/setup'),
      },
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

    // Clear Filters command (context-specific)
    if (
      location.pathname === '/specimens' ||
      location.pathname === '/studies' ||
      location.pathname === '/statistics'
    ) {
      contextCommands.push({
        id: 'clear-filters',
        label: 'Clear Filters',
        category: 'Data Management',
        keywords: ['clear filters', 'reset filters', 'remove filters'],
        action: handleClearFilters,
        context: ['/specimens', '/studies', '/statistics'],
      })
    }

    // Refresh Current Page command (available everywhere)
    contextCommands.push({
      id: 'refresh-page',
      label: 'Refresh Current Page',
      category: 'Data Management',
      keywords: ['refresh', 'reload', 'update'],
      action: handleRefreshPage,
    })

    return [...baseCommands, ...contextCommands]
  }, [navigate, location.pathname, openSearchModal])

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

  return (
    <SetupGuard>
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
            className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-white rounded-lg shadow-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-200"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/studies" element={<Studies />} />
          <Route path="/studies/new" element={<StudyNew />} />
          <Route path="/studies/:id" element={<StudyDetail />} />
          <Route path="/subjects/:id" element={<SubjectDetail />} />
          <Route path="/specimens" element={<Specimens />} />
          <Route path="/specimens/new" element={<SpecimenNew />} />
          <Route path="/specimens/:id" element={<SpecimenDetail />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/containers/:id" element={<ContainerDetail />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/locations/:id" element={<LocationDetail />} />
          <Route path="/import" element={<Import />} />
          <Route path="/export" element={<Export />} />
          <Route path="/barcode-export" element={<BarcodeExport />} />
          <Route path="/container-move/micronix" element={<ContainerMoveMicronix />} />
          <Route path="/container-move/cryovial" element={<ContainerMoveCryovial />} />
          <Route path="/container-move/papers" element={<ContainerMovePapers />} />
          <Route path="/collection-move" element={<CollectionMove />} />
          <Route path="/collections/micronix-plates/:id" element={<MicronixPlateDetail />} />
          <Route path="/collections/cryovial-boxes/:id" element={<CryovialBoxDetail />} />
          <Route path="/collections/boxes/:id" element={<BoxDetail />} />
          <Route path="/collections/bags/:id" element={<BagDetail />} />
          <Route path="/collections/sheets/:id" element={<SheetDetail />} />
          <Route path="/blood-controls" element={<BloodControls />} />
          <Route path="/blood-controls/new" element={<ControlDefinitionForm />} />
          <Route path="/blood-controls/:id" element={<ControlDefinitionDetail />} />
          <Route path="/blood-controls/:id/edit" element={<ControlDefinitionForm />} />
          <Route path="/blood-controls/batches/new" element={<ControlBatchWizard />} />
          <Route path="/blood-controls/batches/:id" element={<ControlBatchDetail />} />
          <Route path="/blood-controls/batches/:id/add-specimens" element={<ControlBatchWizard />} />
              <Route path="/reference-data" element={<ReferenceData />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/derivations" element={<Derivations />} />
              <Route path="/derivations/import" element={<DerivationsImport />} />
            </Routes>
          </main>
        </div>

        {/* Floating action buttons */}
        <div 
          ref={buttonsRef}
          data-floating-buttons="true"
          className="fixed right-6 z-50 flex flex-col gap-2 transition-[top] duration-500 ease-in-out"
          style={{
            top: shouldButtonsBeAtTop 
              ? '1.5rem' 
              : `calc(100vh - 1.5rem - ${buttonsHeight}px)`,
          }}
        >
          {/* Command palette button */}
          <button
            onClick={openCommandPalette}
            className="group flex items-center gap-2 px-3 py-2.5 bg-white text-gray-700 rounded-lg shadow-md hover:shadow-lg border border-gray-200 hover:border-blue-300 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
            aria-label="Open command palette"
          >
            <svg className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <span className="text-xs font-medium text-gray-500 group-hover:text-blue-600 transition-colors">
              {isMac() ? '⌘⇧K' : 'Ctrl+Shift+K'}
            </span>
          </button>

          {/* Search button */}
          <button
            onClick={openSearchModal}
            className="group flex items-center gap-2 px-3 py-2.5 bg-white text-gray-700 rounded-lg shadow-md hover:shadow-lg border border-gray-200 hover:border-blue-300 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
            aria-label="Open search"
          >
            <svg className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs font-medium text-gray-500 group-hover:text-blue-600 transition-colors">
              {isMac() ? '⌘K' : 'Ctrl+K'}
            </span>
          </button>
        </div>
      </div>
      <HotkeyHelpModal isOpen={isHelpModalOpen} onClose={toggleHelpModal} />
      <SearchModal isOpen={isSearchModalOpen} onClose={closeSearchModal} />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        commands={commands}
      />
    </SetupGuard>
  )
}

function App() {
  return (
    <DateFilterProvider>
      <HotkeyProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </HotkeyProvider>
    </DateFilterProvider>
  )
}

export default App
