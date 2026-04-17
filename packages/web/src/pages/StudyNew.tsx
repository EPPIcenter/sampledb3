import { Navigate, useNavigate } from 'react-router-dom'
import StudyForm from '../components/forms/StudyForm'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { useUser } from '../contexts/UserContext'
import '../styles/studies.css'

export default function StudyNew() {
  const navigate = useNavigate()
  const { canWrite } = useUser()

  if (!canWrite) {
    return <Navigate to="/studies" replace />
  }

  return (
    <div className="studies-page min-h-screen">
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="mb-6">
          <EntityBreadcrumbs
            items={[
              { label: 'Studies', to: '/studies' },
              { label: 'Create Study' },
            ]}
          />
          <h1 className="text-3xl font-bold" style={{ color: 'rgb(var(--app-text))' }}>Create Study</h1>
        </div>

        <div className="dashboard-card rounded-xl p-6 max-w-2xl mx-auto">
          <StudyForm onCancel={() => navigate('/studies')} />
        </div>
      </div>
    </div>
  )
}

