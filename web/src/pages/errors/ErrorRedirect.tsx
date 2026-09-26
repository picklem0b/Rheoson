import { useLocation, useNavigate } from 'react-router-dom'
import ErrorPage, { ErrorPageNavActions } from './ErrorPage'
import { errorPageFor } from '@/lib/errorPages'
import { splitErrorCode } from '@/api/client.api'

export interface LocationErrorState {
  /** HTTP status of the failure that routed here. */
  status?: number
  /** Raw detail from the API error, if any. */
  message?: string
  /** Backend DCCNN code, when the failure carried one. */
  code?: string
}

/**
 * Renders the ErrorPage for an error passed through router state
 * (`navigate('/error', { state: { status, message, code } })` — sent by
 * lib/fatalApiError on unhandled ≥500 API failures).
 *
 * Direct navigation with no state renders the 500 fallback — an /error URL
 * on its own is always an error, never a blank page.
 */
export default function ErrorRedirect() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state ?? {}) as LocationErrorState

  // State message may still carry the trailing "[ERR …]" suffix (older
  // senders embedded it in the text); split so the chip renders once.
  const { message: splitMessage, code: splitCode } = splitErrorCode(
    state.message ?? ''
  )
  const config = errorPageFor(state.status)

  return (
    <ErrorPage
      status={config.status}
      message={splitMessage || undefined}
      code={state.code ?? splitCode}
      onRetry={() => navigate(-1)}
      actions={<ErrorPageNavActions />}
    />
  )
}
