import ErrorPage from '@/components/errors/ErrorPage';
import { ERROR_PAGES, FALLBACK_ERROR_PAGE } from '@/lib/errorPages';

/**
 * Route-reachable error states (/error/404, /error/502, …) — used by API
 * failure interception, auth guards and deep links. An unmapped code
 * renders the 500 fallback, exactly like errorPageFor's contract.
 */
export function generateStaticParams(): Array<{ code: string }> {
  return Object.values(ERROR_PAGES).map((page) => ({ code: String(page.status) }));
}

export default async function ErrorCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const status = Number.parseInt(code, 10);
  const page = ERROR_PAGES[status] ?? FALLBACK_ERROR_PAGE;
  return <ErrorPage status={page.status} />;
}
