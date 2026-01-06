import { Link } from 'react-router-dom'

export default function Derivations() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Derivations</h1>
            <p className="text-gray-600">
              Track relationships between containers when materials are processed, extracted, diluted, or otherwise transformed.
            </p>
          </div>
          <Link
            to="/derivations/import"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Import CSV
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-100 p-6">
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Derivation List View</h3>
          <p className="mt-1 text-sm text-gray-500">
            Browse derivations from individual container detail pages.
          </p>
          <div className="mt-6">
            <p className="text-sm text-gray-600 mb-4">
              To view derivations:
            </p>
            <ul className="text-sm text-gray-600 space-y-2 text-left max-w-md mx-auto">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Navigate to any container detail page</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>View derived containers or source information in the derivation sections</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Click "View Chain" to see the full derivation chain</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Use "Import CSV" to create multiple derivations at once</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

