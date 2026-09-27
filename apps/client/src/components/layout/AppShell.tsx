'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LogoMark } from '@/components/auth/AuthVisual';
import { signOutDev } from '@/lib/devAuth';
import { usePopupStore } from '@/store/popup.store';

/**
 * AppShell — one shell, two arrangements, brutalist chrome.
 *
 * Desktop gets a sidebar (a wide window with a bottom bar wastes the space a
 * library needs); mobile gets the bottom bar, which is where a thumb is. The
 * breakpoint is a CSS media query rather than a device sniff, so resizing a
 * desktop window behaves the way it looks like it should.
 *
 * The player bar is fixed to the bottom, so the content area reserves its
 * height — otherwise the last row of every list is permanently unreachable.
 *
 * The profile entry replaces a bare settings cog: the avatar opens the
 * account sheet (settings, stats, sign out), which is where a person expects
 * to find themselves, not behind a gear icon.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function Icon({ path, filled = false }: { path: string; filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 256 256" aria-hidden="true">
      <path d={path} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="18" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: '/home', label: 'Home', icon: <Icon path="M40 128l88-72 88 72v80a8 8 0 0 1-8 8h-56v-64h-48v64H48a8 8 0 0 1-8-8z" /> },
  { href: '/search', label: 'Search', icon: <Icon path="M112 40a72 72 0 1 0 0 144 72 72 0 0 0 0-144zm50 122l54 54" /> },
  { href: '/library', label: 'Library', icon: <Icon path="M48 48h40v160H48zM108 48h40v160h-40zM168 60l36 148-40 10-36-148z" /> },
  { href: '/downloads', label: 'Downloads', icon: <Icon path="M128 40v104m0 0l-40-40m40 40l40-40M56 200h144" /> },
];

function AccountLink() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const confirm = usePopupStore((state) => state.confirm);
  const active = pathname.startsWith('/settings') || pathname.startsWith('/stats');

  const signOut = () => {
    setOpen(false);
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Account"
        className="brut-btn size-9 !p-0 text-xs font-black"
        data-variant={active ? 'accent' : 'plain'}
        style={active ? undefined : { background: 'var(--bg-surface)' }}
      >
        A
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center p-4 md:items-center"
          style={{ background: 'rgb(var(--gray-950) / 0.62)' }}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Account"
            className="brut-panel w-full max-w-xs p-2"
            onClick={(event) => event.stopPropagation()}
          >
            {[
              { href: '/settings', label: 'Settings', icon: <Icon path="M128 96a32 32 0 1 0 0 64 32 32 0 0 0 0-64zM128 24v24M128 208v24M40 128H16M240 128h-24M68 68l-17-17M205 205l-17-17M188 68l17-17M51 205l17-17" /> },
              { href: '/stats', label: 'Listening stats', icon: <Icon path="M40 200V96m56 104V56m56 144v-72m56 72V80" /> },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
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
              <Icon path="M64 176v24a16 16 0 0 0 16 16h96a16 16 0 0 0 16-16v-24M96 80l32-32 32 32M128 48v96" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Popups must outlive a route change only while open; leaving the page that
  // raised one is a good moment to drop it.
  useEffect(() => {
    document.title = `Rheoson — ${NAV.find((item) => pathname.startsWith(item.href))?.label ?? 'Music'}`;
  }, [pathname]);

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <aside
        className="hidden shrink-0 flex-col gap-1 p-4 md:flex"
        style={{ width: 'var(--sidebar-width)', borderRight: '2px solid var(--border)' }}
      >
        <Link href="/home" className="mb-4 flex items-center gap-2.5 px-2">
          <LogoMark size={30} />
          <span className="text-base font-extrabold tracking-tight">Rheoson</span>
        </Link>
        {NAV.map((item) => (
          <SidebarLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}
        <div className="mt-auto">
          <AccountLink />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className="min-w-0 flex-1 px-4 pt-4 md:px-6"
          style={{ paddingBottom: 'calc(var(--player-height) + var(--nav-height) + var(--safe-area-bottom) + 1rem)' }}
        >
          {children}
        </main>
      </div>

      {/* Mobile top bar: identity on the right, like the big three. */}
      <div
        className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-2 md:hidden"
        style={{ background: 'var(--glass-bg)', borderBottom: '2px solid var(--border)', backdropFilter: 'blur(12px)', paddingTop: 'calc(var(--safe-area-top) + 0.5rem)' }}
      >
        <Link href="/home" className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-sm font-extrabold tracking-tight">Rheoson</span>
        </Link>
        <AccountLink />
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex md:hidden"
        style={{
          background: 'var(--glass-bg)',
          borderTop: '2px solid var(--border-strong)',
          backdropFilter: 'blur(12px)',
          paddingBottom: 'var(--safe-area-bottom)',
          // The player bar sits above the nav, so the bar's own height is what
          // separates the two.
          bottom: 'var(--player-height)',
        }}
        aria-label="Main"
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold uppercase tracking-wide"
            style={{ color: pathname.startsWith(item.href) ? 'var(--accent-bright)' : 'var(--text-secondary)' }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className="flex items-center gap-3 px-3 py-2 text-sm font-bold transition-all active:translate-x-0.5"
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent-bright)' : 'var(--text-secondary)',
        border: active ? '2px solid var(--accent-border)' : '2px solid transparent',
        borderRadius: 'var(--radius-brut)',
      }}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}
