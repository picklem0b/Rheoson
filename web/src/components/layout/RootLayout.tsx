import { Outlet } from 'react-router-dom'
import { Toaster } from '@/components/ui/Toaster'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import PlayerBar from '@/components/player/PlayerBar'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

export default function RootLayout() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)

  return (
    <Toaster>
      <div className="flex h-full w-full overflow-hidden bg-[var(--bg-base)]">

        {/* Sidebar — desktop only */}
        <aside className="hidden lg:flex flex-shrink-0">
          <Sidebar />
        </aside>

        {/* Main content */}
        <div className={cn(
          'flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-300',
        )}>
          {/* Page content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pb-[calc(var(--player-height)+var(--nav-height)+1rem)] lg:pb-[calc(var(--player-height)+1rem)]">
            <div className="page-enter">
              <Outlet />
            </div>
          </main>

          {/* Player bar */}
          <div className="flex-shrink-0">
            <PlayerBar />
          </div>
        </div>

        {/* Bottom nav — mobile/tablet */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex justify-center pb-safe px-4 pb-4">
          <BottomNav />
        </nav>
      </div>
    </Toaster>
  )
}