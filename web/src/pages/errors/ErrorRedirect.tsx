import { useLocation, useNavigate } from 'react-router-dom'
import ErrorPage, { ErrorPageNavActions } from './ErrorPage'
import { errorPageFor } from '@/lib/errorPages'

export interface LocationErrorState {
  /** HTTP status of the failure that routed here. */
  status?: number
  /** Raw detail from the API error, if any. */
  message?: string
}

/**
 * Renders the ErrorPage for an error passed through router state
 * (`navigate('/error', { state: { status, message } })`).
 *
 * Used for API failures that should take over the page (auth guards, server
 * failures, rate limits). Direct navigation with no state renders the 500
 * fallback — an /error URL on its own is always an error, never a blank page.
 */
export default function ErrorRedirect() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state ?? {}) as LocationErrorState
  const config = errorPageFor(state.status)

  return (
    <ErrorPage
      status={config.status}
      message={state.message}
      onRetry={() => navigate(-1)}
      actions={<ErrorPageNavActions />}
    />
  )
}
