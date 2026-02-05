import { Navigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import BulkImportFlow from '../components/BulkImportFlow'
import '../styles/storage.css'

export default function Import() {
  const { canWrite } = useUser()

  if (!canWrite) {
    return <Navigate to="/" replace />
  }

  return (
    <BulkImportFlow />
  )
}
