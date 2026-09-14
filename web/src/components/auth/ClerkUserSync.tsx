import { useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useAuthStore } from '@/store/auth.store';
import { setClerkToken, setClerkTokenProvider } from '@/api/client.api';

/**
 * Bridges Clerk's user state AND session token into the local Zustand
 * auth store so the rest of the app (profile page, sidebar avatar,
 * API requests) can work without directly depending on Clerk hooks.
 *
 * Mount this inside <ClerkProvider>.
 *
 * Tokens: Clerk session JWTs are short-lived (60s). Rather than caching one
 * at mount time, this component registers Clerk's own `getToken` as the
 * request layer's token provider, so every API call receives a valid token —
 * Clerk refreshes transparently once the cached one is near expiry.
 */
export default function ClerkUserSync() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const syncClerkUser = useAuthStore((s) => s.syncClerkUser);

  // Sync user data into the Zustand store. Gated on isLoaded: while Clerk is
  // still resolving at boot, isSignedIn is not final — clearing the store then
  // would wipe a persisted session and flash the Landing page after a restart.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user) {
      syncClerkUser({
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? user.username ?? undefined,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt?.toISOString(),
      });
    } else {
      syncClerkUser(null);
    }
  }, [isLoaded, isSignedIn, user, syncClerkUser]);

  // Register the refreshing token provider for API requests. `skipCache`
  // forces a brand-new JWT, used by the client's 401 recovery path.
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setClerkTokenProvider(null);
      setClerkToken(null);
      return;
    }

    setClerkTokenProvider((opts) =>
      getToken(opts?.skipCache ? { skipCache: true } : undefined).catch(() => null)
    );

    // Prime the synchronous cache so socket auth and instant first-render
    // requests have a token immediately.
    getToken()
      .then((token) => setClerkToken(token))
      .catch(() => setClerkToken(null));

    return () => setClerkTokenProvider(null);
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}
