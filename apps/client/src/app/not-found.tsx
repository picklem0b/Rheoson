import ErrorPage from '@/components/errors/ErrorPage';

/** Unknown URL → 404 error page (App Router convention slot). */
export default function NotFound() {
  return <ErrorPage status={404} />;
}
