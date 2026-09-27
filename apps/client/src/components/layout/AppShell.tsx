'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * AppShell — one shell, two arrangements.
 *
 * Desktop gets a sidebar (a wide window with a bottom bar wastes the space a
 * library needs); mobile gets the bottom bar, which is where a thumb is. The
 * breakpoint is a CSS media query rather than a device sniff, so resizing a
 * desktop window behaves the way it looks like it should.
 *
 * The player bar is fixed to the bottom, so the content area reserves its
 * height — otherwise the last row of every list is permanently unreachable.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function Icon({ path, filled = false }: { path: string; filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 256 256" aria-hidden="true">
      <path d={path} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="16" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: '/home', label: 'Home', icon: <Icon path="M40 128l88-72 88 72v80a8 8 0 0 1-8 8h-56v-64h-48v64H48a8 8 0 0 1-8-8z" /> },
  { href: '/search', label: 'Search', icon: <Icon path="M112 40a72 72 0 1 0 0 144 72 72 0 0 0 0-144zm50 122l54 54" /> },
  { href: '/library', label: 'Library', icon: <Icon path="M48 48h40v160H48zM108 48h40v160h-40zM168 60l36 148-40 10-36-148z" /> },
  { href: '/downloads', label: 'Downloads', icon: <Icon path="M128 40v104m0 0l-40-40m40 40l40-40M56 200h144" /> },
  { href: '/settings', label: 'Settings', icon: <Icon path="M128 96a32 32 0 1 0 0 64 32 32 0 0 0 0-64zM128 24v24M128 208v24M40 128H16M240 128h-24M68 68l-17-17M205 205l-17-17M188 68l17-17M51 205l17-17" /> },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <aside
        className="hidden shrink-0 flex-col gap-1 p-4 md:flex"
        style={{ width: 'var(--sidebar-width)', borderRight: '1px solid var(--border)' }}
      >
        <Link href="/home" className="mb-4 flex items-center gap-2.5 px-2">
          <span
            className="grid size-8 place-items-center rounded-[10px] text-sm font-bold"
            style={{ background: 'var(--accent)', color: 'rgb(255 255 255)' }}
            aria-hidden="true"
          >
            R
          </span>
          <span className="text-base font-semibold">Rheoson</span>
        </Link>
        {NAV.map((item) => (
          <SidebarLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className="min-w-0 flex-1 px-4 pt-4 md:px-6"
          style={{ paddingBottom: 'calc(var(--player-height) + var(--nav-height) + var(--safe-area-bottom) + 1rem)' }}
        >
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex md:hidden"
        style={{
          background: 'var(--glass-bg)',
          borderTop: '1px solid var(--border)',
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
            className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium"
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
      className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors"
      style={{
        background: active ? 'var(--bg-surface)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}
