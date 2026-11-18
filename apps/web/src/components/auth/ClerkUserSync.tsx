import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useAuthStore } from '@/store/auth.store';
import { setClerkToken, setClerkTokenProvider } from '@/api/client.api';
import { activateSnapshot, clearSnapshots } from '@/lib/querySnapshot';

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
/**
 * Keeps a Clerk render failure from becoming a dead app.
 *
 * Clerk's React hooks throw when the provider has no context — which happens
 * for a malformed key, when its remote script cannot load, or when the
 * session instance is revoked mid-flight. Because the throw happens during
 * render of a routed component, react-router escalates it to its default
 * "Unexpected Application Error!" page, i.e. the whole app dies and no music
 * plays. Catching it here lets the root swap to local mode instead: the
 * account features go away, playback, downloads and the library do not.
 */
interface CrashGuardProps {
  children: ReactNode;
  /** Called once when a descendant throws; the root then unmounts Clerk. */
  onFail: () => void;
}

interface CrashGuardState {
  failed: boolean;
}

export class ClerkCrashGuard extends Component<CrashGuardProps, CrashGuardState> {
  state: CrashGuardState = { failed: false };

  static getDerivedStateFromError(): CrashGuardState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[rheoson] Clerk failed at runtime — falling back to local mode', error, info);
    this.props.onFail();
  }

  render(): ReactNode {
    // Rendering null (not children) is deliberate: children would throw again
    // on the very next render, before the root has had a chance to unmount
    // the provider.
    return this.state.failed ? null : this.props.children;
  }
}

export default function ClerkUserSync() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
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
        username: user.username ?? undefined,
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

  // Remember the small account summaries so a revisit paints them immediately
  // instead of showing a spinner for an answer that has not changed. Keyed per
  // account, and wiped on sign-out so a shared device cannot show the next
  // person the previous account's counts.
  useEffect(() => {
    if (!isLoaded) return;
    const account = isSignedIn && user ? user.id : '';
    const dispose = activateSnapshot(queryClient, account);
    return () => dispose();
  }, [isLoaded, isSignedIn, user, queryClient]);

  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (!isLoaded) return;
    if (wasSignedIn.current && !isSignedIn) clearSnapshots();
    wasSignedIn.current = isSignedIn;
  }, [isLoaded, isSignedIn]);

  return null;
}
