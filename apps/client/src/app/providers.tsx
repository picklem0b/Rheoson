'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import ClerkBridge from '@/components/auth/ClerkBridge';
import PlayerBar from '@/components/player/PlayerBar';
import ToastHost from '@/components/toast/ToastHost';
import { useMediaSession } from '@/hooks/mediaSession.hook';
import { isPageStatus, onPageError, type ApiError } from '@/lib/api';
import { clerkConfigured, devSession, session, setSession } from '@/lib/session';
import { connectDownloads, useDownloadsStore } from '@/store/downloads.store';
import { bindAudioEvents } from '@/store/player.store';

/**
 * Providers — everything that must exist exactly once for the whole app.
 *
 * The interesting decision here is the **error bridge**. A failure that no
 * component handles must not vanish: a 5xx is not something a toast can fix, so
 * the API layer escalates it, and this component turns that into a navigation
 * to the error page carrying the status *and* the DCCNN code. 401 does the same
 * (the user must sign in); 403 too. 404 and 429 deliberately do **not**
 * navigate — "that track was not found" is not a reason to take the whole
 * screen away from someone browsing a library.
 */

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const initialised = useRef(false);

  // Session provider: Clerk when configured, the dev identity otherwise.
  const clerkOn = clerkConfigured();

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    // With a publishable key, `ClerkBridge` below installs the real provider
    // from Clerk's own hooks; without one the dev session keeps the app
    // bootable and the server's dev posture is what accepts it.
    if (!clerkOn) setSession(devSession);
  }, [clerkOn]);

  // The error bridge.
  useEffect(() => {
    onPageError((error: ApiError) => {
      const status = error.status >= 500 ? error.status : error.status;
      if (status === 404 || status === 429) return;
      if (!isPageStatus(status)) return;

      const params = new URLSearchParams();
      if (error.code) params.set('code', error.code);
      if (error.detail) params.set('detail', error.detail);
      const query = params.toString();
      router.push(`/error/${status}${query ? `?${query}` : ''}`);
    });
    return () => onPageError(null);
  }, [router]);

  // One audio element, one event subscription.
  useEffect(() => bindAudioEvents(), []);

  // One event stream, one job list.
  useEffect(() => {
    const disconnect = connectDownloads();
    void useDownloadsStore.getState().refresh();
    return () => disconnect();
  }, []);

  useMediaSession();

  const content = (
    <>
      {children}
      <PlayerBar />
      <ToastHost />
    </>
  );

  // The provider wraps the whole tree, so a Clerk hook anywhere below resolves
  // against it. Without keys nothing is wrapped and the dev session stands.
  return clerkOn ? <ClerkBridge>{content}</ClerkBridge> : content;
}

/**
 * Exposed so a component can read the active session without importing the
 * mutable module directly — the indirection is what keeps the provider
 * swappable.
 */
export function useSession() {
  return session();
}
