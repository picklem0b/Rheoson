'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { signOutDev } from '@/lib/devAuth';
import { usePopupStore } from '@/store/popup.store';
import { registerUI } from '@/store/ui.registry';

/**
 * AccountSheet — the avatar's menu: settings, stats, sign out.
 *
 * Registered into the `account-sheet` slot, so an alternative (a full profile
 * page, a drawer, a Clerk AccountPortal) replaces it with one
 * `registerUI('account-sheet', Mine)` call — the avatar button renders
 * whatever owns the slot and does not know this sheet exists.
 */
function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const confirm = usePopupStore((state) => state.confirm);

  if (!open) return null;

  const signOut = () => {
    onClose();
    confirm({
      title: 'Sign out?',
      body: 'Your library stays on the server; only this device forgets the session.',
      confirmLabel: 'Sign out',
      onConfirm: () => {
        signOutDev();
        router.replace('/welcome');
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center p-4 md:items-center"
      style={{ background: 'rgb(var(--gray-950) / 0.62)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className="brut-panel w-full max-w-xs p-2"
        onClick={(event) => event.stopPropagation()}
      >
        {[
          {
            href: '/settings',
            label: 'Settings',
            icon: (
              <svg width="20" height="20" viewBox="0 0 256 256" aria-hidden="true">
                <path
                  d="M128 96a32 32 0 1 0 0 64 32 32 0 0 0 0-64zM128 24v24M128 208v24M40 128H16M240 128h-24M68 68l-17-17M205 205l-17-17M188 68l17-17M51 205l17-17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="18"
                  strokeLinecap="round"
                />
              </svg>
            ),
          },
          {
            href: '/stats',
            label: 'Listening stats',
            icon: (
              <svg width="20" height="20" viewBox="0 0 256 256" aria-hidden="true">
                <path d="M40 200V96m56 104V56m56 144v-72m56 72V80" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
              </svg>
            ),
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-3 text-sm font-bold"
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-bold"
          style={{ color: 'var(--danger-text)', borderRadius: 'var(--radius-sm)' }}
        >
          <svg width="20" height="20" viewBox="0 0 256 256" aria-hidden="true">
            <path
              d="M64 176v24a16 16 0 0 0 16 16h96a16 16 0 0 0 16-16v-24M96 80l32-32 32 32M128 48v96"
              fill="none"
              stroke="currentColor"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );
}

// The sheet owns its slot registration: importing this module is what makes
// the slot live, which keeps the wiring next to the thing being wired.
registerUI('account-sheet', AccountSheet, 'AccountSheet default');

export default AccountSheet;
