import ErrorPage, { ErrorPageNavActions } from './ErrorPage'

/**
 * Route-level 404 — unknown paths land here (both catch-alls in router.tsx).
 * A thin wrapper so the route array stays declarative; the visual treatment
 * and the copy come from ErrorPage + lib/errorPages.
 */
export default function NotFound() {
  return <ErrorPage status={404} actions={<ErrorPageNavActions />} />
}
