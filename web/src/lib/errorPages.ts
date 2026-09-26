/**
 * Error-page configuration — one entry per supported HTTP state.
 *
 * Adding a status later means adding an entry here (and, if it should be
 * route-reachable, wiring it in router.tsx); no component changes. The short
 * `label` is always visible; `title`/`subtitle` are specific to the error and
 * revealed by the ⓘ control.
 */

export interface ErrorPageConfig {
  /** HTTP status this entry represents. */
  status: number
  /** Short label under the big code, e.g. "NOT FOUND". */
  label: string
  /** Panel title, e.g. "Not Found". */
  title: string
  /** Panel subtitle — the actual explanation. */
  subtitle: string
}

export const ERROR_PAGES: Record<number, ErrorPageConfig> = {
  400: {
    status: 400,
    label: 'BAD REQUEST',
    title: 'Bad Request',
    subtitle: 'The app sent something the server could not make sense of.',
  },
  401: {
    status: 401,
    label: 'UNAUTHORIZED',
    title: 'Sign in required',
    subtitle: 'You need to sign in first.',
  },
  403: {
    status: 403,
    label: 'FORBIDDEN',
    title: 'No access',
    subtitle: "You can't go there.",
  },
  404: {
    status: 404,
    label: 'NOT FOUND',
    title: 'Not Found',
    subtitle: "We couldn't find the page you're looking for.",
  },
  429: {
    status: 429,
    label: 'TOO MANY REQUESTS',
    title: 'Slow down',
    subtitle: 'Whoa, slow down.',
  },
  500: {
    status: 500,
    label: 'SERVER ERROR',
    title: 'Server error',
    subtitle: 'Something broke.',
  },
  502: {
    status: 502,
    label: 'BAD GATEWAY',
    title: 'Bad gateway',
    subtitle: "The server isn't talking to us.",
  },
  503: {
    status: 503,
    label: 'SERVICE UNAVAILABLE',
    title: 'Be right back',
    subtitle: "We'll be back shortly.",
  },
  504: {
    status: 504,
    label: 'GATEWAY TIMEOUT',
    title: 'Gateway timeout',
    subtitle: 'The server took too long.',
  },
}

/** Fallback for unknown/unmapped errors — deliberately 500-shaped. */
export const FALLBACK_ERROR_PAGE: ErrorPageConfig = {
  status: 500,
  label: 'SERVER ERROR',
  title: 'Something went wrong',
  subtitle: 'An unexpected error occurred. Retrying may help.',
}

export function errorPageFor(status: number | undefined | null): ErrorPageConfig {
  return (status && ERROR_PAGES[status]) || FALLBACK_ERROR_PAGE
}
