import { useNavigate } from 'react-router-dom'
import SpecimenForm from '../components/forms/SpecimenForm'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'

export default function SpecimenNew() {
  const navigate = useNavigate()

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs
          items={[
            { label: 'Specimens', to: '/specimens' },
            { label: 'Create Specimen' },
          ]}
        />
        <h1 className="text-3xl font-bold text-gray-900">Create Specimen</h1>
        <p className="mt-2 text-sm text-gray-600">
          Choose the source and study, then enter specimen details. You can always update
          containers and storage later.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-5xl mx-auto">
        <SpecimenForm onCancel={() => navigate('/specimens')} />
      </div>
    </div>
  )
}


