import ErrorPage from '@/components/errors/ErrorPage';
import { ERROR_PAGES, FALLBACK_ERROR_PAGE } from '@/lib/errorPages';

/**
 * Route-reachable error states (/error/404, /error/502, …) — used by API
 * failure interception, auth guards and deep links. An unmapped code renders
 * the 500 fallback, exactly like errorPageFor's contract.
 *
 * `?code=` and `?detail=` carry the DCCNN chip from the failure that caused the
 * navigation, so the page the user lands on can show the *specific* reason and
 * not just the status.
 */
export function generateStaticParams(): Array<{ code: string }> {
  return Object.values(ERROR_PAGES).map((page) => ({ code: String(page.status) }));
}

export default async function ErrorCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ code?: string; detail?: string }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const status = Number.parseInt(code, 10);
  const page = ERROR_PAGES[status] ?? FALLBACK_ERROR_PAGE;

  return <ErrorPage status={page.status} code={query.code ?? null} detail={query.detail ?? null} />;
}
