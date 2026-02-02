import { Navigate } from 'react-router-dom'
import StudyForm from '../components/forms/StudyForm'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { useUser } from '../contexts/UserContext'

export default function StudyNew() {
  const { canWrite } = useUser()

  if (!canWrite) {
    return <Navigate to="/studies" replace />
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs
          items={[
            { label: 'Studies', to: '/studies' },
            { label: 'Create Study' },
          ]}
        />
        <h1 className="text-3xl font-bold text-gray-900">Create Study</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mx-auto">
        <StudyForm />
      </div>
    </div>
  )
}

