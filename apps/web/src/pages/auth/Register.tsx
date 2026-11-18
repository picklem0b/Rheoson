import { Navigate } from 'react-router-dom'

/** Legacy redirect — /register now uses the unified AuthPage. */
export default function Register() {
  return <Navigate to="/auth" replace />
}
