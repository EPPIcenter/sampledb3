import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
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
import BulkOperations from './pages/BulkOperations'
import AliquotMoveMicronix from './pages/AliquotMoveMicronix'
import AliquotMoveCryovial from './pages/AliquotMoveCryovial'
import AliquotMoveGenericTubes from './pages/AliquotMoveGenericTubes'
import AliquotMovePapers from './pages/AliquotMovePapers'
import GlobalSearch from './components/GlobalSearch'
import NavDropdown from './components/NavDropdown'
import StudyNew from './pages/StudyNew'
import SpecimenNew from './pages/SpecimenNew'
import MicronixPlateDetail from './pages/MicronixPlateDetail'
import CryovialBoxDetail from './pages/CryovialBoxDetail'
import BoxDetail from './pages/BoxDetail'
import BagDetail from './pages/BagDetail'
import SheetDetail from './pages/SheetDetail'
import ControlBatchDetail from './pages/ControlBatchDetail'
import ControlDefinitionDetail from './pages/ControlDefinitionDetail'
import Controls from './pages/Controls'
import ReferenceData from './pages/ReferenceData'
import { DateFilterProvider } from './contexts/DateFilterContext'

function App() {
  return (
    <DateFilterProvider>
      <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b border-gray-100">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16 gap-8">
              <div className="flex items-center space-x-8">
                <Link to="/" className="text-xl font-bold text-blue-600">
                  SampleDB
                </Link>
                <nav className="flex items-center space-x-4 h-full">
                  <Link to="/" className="text-gray-600 hover:text-gray-900 flex items-center h-full">
                    Dashboard
                  </Link>
                  <Link to="/studies" className="text-gray-600 hover:text-gray-900 flex items-center h-full">
                    Studies
                  </Link>
                  <Link to="/specimens" className="text-gray-600 hover:text-gray-900 flex items-center h-full">
                    Specimens
                  </Link>
                  <Link to="/statistics" className="text-gray-600 hover:text-gray-900 flex items-center h-full">
                    Statistics
                  </Link>
                  <Link to="/locations" className="text-gray-600 hover:text-gray-900 flex items-center h-full">
                    Locations
                  </Link>
                  <Link to="/import" className="text-gray-600 hover:text-gray-900 flex items-center h-full">
                    Import
                  </Link>
                  <div className="flex items-center h-full">
                    <NavDropdown
                      label="Move Aliquots"
                      items={[
                        { label: 'Move Micronix Tubes', to: '/aliquot-move/micronix' },
                        { label: 'Move Cryovial Tubes', to: '/aliquot-move/cryovial' },
                        { label: 'Move Generic Tubes', to: '/aliquot-move/generic-tubes' },
                        { label: 'Move Papers', to: '/aliquot-move/papers' },
                      ]}
                    />
                  </div>
                  <div className="flex items-center h-full">
                    <NavDropdown
                      label="More"
                      items={[
                        { label: 'Controls', to: '/controls' },
                        { label: 'Reference Data', to: '/settings/reference-data' },
                      ]}
                    />
                  </div>
                </nav>
              </div>
              <div className="flex-shrink-0">
                <GlobalSearch />
              </div>
            </div>
          </div>
        </nav>

        <Routes>
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
          <Route path="/aliquot-move/micronix" element={<AliquotMoveMicronix />} />
          <Route path="/aliquot-move/cryovial" element={<AliquotMoveCryovial />} />
          <Route path="/aliquot-move/generic-tubes" element={<AliquotMoveGenericTubes />} />
          <Route path="/aliquot-move/papers" element={<AliquotMovePapers />} />
          <Route path="/bulk" element={<BulkOperations />} />
          <Route path="/collections/micronix-plates/:id" element={<MicronixPlateDetail />} />
          <Route path="/collections/cryovial-boxes/:id" element={<CryovialBoxDetail />} />
          <Route path="/collections/boxes/:id" element={<BoxDetail />} />
          <Route path="/collections/bags/:id" element={<BagDetail />} />
          <Route path="/collections/sheets/:id" element={<SheetDetail />} />
          <Route path="/controls" element={<Controls />} />
          <Route path="/controls/:id" element={<ControlDefinitionDetail />} />
          <Route path="/controls/batches/:id" element={<ControlBatchDetail />} />
          <Route path="/settings/reference-data" element={<ReferenceData />} />
        </Routes>
      </div>
      </BrowserRouter>
    </DateFilterProvider>
  )
}

export default App
