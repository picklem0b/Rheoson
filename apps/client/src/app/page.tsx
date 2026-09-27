import { redirect } from 'next/navigation';

/**
 * The root route is a redirect, not a landing page.
 *
 * Rheoson is an app, not a marketing site: someone who opens it wants their
 * library, and anyone who is not signed in is answered by the API with a 401,
 * which the error bridge turns into the sign-in error page. A marketing page
 * here would be a screen every returning user has to dismiss.
 */
export default function RootPage() {
  redirect('/home');
}
