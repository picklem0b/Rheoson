'use client';

import ErrorPage from '@/components/errors/ErrorPage';

/**
 * Route error boundary (App Router convention slot). Unknown failures
 * degrade to the 500 shape — the same fallback rule as the API's
 * wireErrorBody and the client's errorPageFor.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string; status?: number };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-base)' }}>
      <ErrorPage status={error.status ?? null} detail={error.digest ?? null} />
      <div className="flex justify-center pb-12">
        <button
          type="button"
          onClick={reset}
          className="rounded-full px-5 py-2.5 text-sm font-medium"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
