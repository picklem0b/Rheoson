'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { LogoMark } from '@/components/auth/AuthVisual';
import { isSignedInDev } from '@/lib/devAuth';

/**
 * The root route is a gate, not a landing page.
 *
 * Signed in (dev posture) → straight to the app. Not signed in → the welcome
 * screen. With a Clerk key, middleware owns this decision and this component
 * only renders the boot mark for the instant before the redirect resolves.
 */
export default function RootPage() {
  const router = useRouter();
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      router.replace('/home');
      return;
    }
    router.replace(isSignedInDev() ? '/home' : '/welcome');
    // Marked from the task queue so the effect's sync pass stays pure.
    const task = setTimeout(() => setDecided(true), 0);
    return () => clearTimeout(task);
  }, [router]);

  return (
    <div className="grid min-h-dvh place-items-center" style={{ background: 'var(--bg-base)' }}>
      {decided ? null : <LogoMark size={56} />}
    </div>
  );
}
