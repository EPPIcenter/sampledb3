import { useNavigate, useParams, Navigate } from 'react-router-dom'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import ControlDefinitionForm from '../components/forms/ControlDefinitionForm'
import { useUser } from '../contexts/UserContext'
import '../styles/blood-controls.css'

/**
 * Wrapper page for new and edit blood control definition.
 * Used for routes: /blood-controls/new, /blood-controls/:id/edit
 */
export default function BloodControlDefinitionPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const { canWrite } = useUser()
  const isEdit = !!id

  if (!canWrite) {
    return <Navigate to="/blood-controls" replace />
  }

  return (
    <div className="blood-controls-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="mb-6 blood-controls-reveal blood-controls-reveal-1">
          <EntityBreadcrumbs
            items={[
              { label: 'Blood Controls', to: '/blood-controls' },
              { label: isEdit ? 'Edit definition' : 'New definition' },
            ]}
          />
          <h1 className="text-3xl font-bold">
            {isEdit ? 'Edit Blood Control Definition' : 'New Blood Control Definition'}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
            {isEdit
              ? 'Update the control definition name, target density, and biological content.'
              : 'Define a new blood control type with target density and strain composition.'}
          </p>
        </div>

        <div className="dashboard-card p-6 max-w-5xl mx-auto blood-controls-reveal blood-controls-reveal-2">
          <ControlDefinitionForm
            onCancel={() => navigate('/blood-controls')}
            onSuccess={() => {
              if (id) {
                navigate(`/blood-controls/${id}`)
              } else {
                navigate('/blood-controls')
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
