import { Navigate } from 'react-router-dom'

/** Legacy redirect — /login now uses the unified AuthPage. */
export default function Login() {
  return <Navigate to="/auth" replace />
}
