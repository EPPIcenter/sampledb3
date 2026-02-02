import { useNavigate, Navigate } from 'react-router-dom'
import SpecimenForm from '../components/forms/SpecimenForm'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { useUser } from '../contexts/UserContext'
import '../styles/subject-specimen.css'

export default function SpecimenNew() {
  const navigate = useNavigate()
  const { canWrite } = useUser()

  if (!canWrite) {
    return <Navigate to="/specimens" replace />
  }

  return (
    <div className="subject-specimen-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="mb-6 subject-specimen-reveal subject-specimen-reveal-1">
          <EntityBreadcrumbs
            items={[
              { label: 'Specimens', to: '/specimens' },
              { label: 'Create Specimen' },
            ]}
          />
          <h1 className="text-3xl font-bold">Create Specimen</h1>
          <p className="mt-2 text-sm text-[rgb(var(--dashboard-text-muted))]">
            Choose the source and study, then enter specimen details. You can always update
            containers and storage later.
          </p>
        </div>

        <div className="dashboard-card p-6 max-w-5xl mx-auto subject-specimen-reveal subject-specimen-reveal-2">
          <SpecimenForm onCancel={() => navigate('/specimens')} />
        </div>
      </div>
    </div>
  )
}


