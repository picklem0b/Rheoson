import { createBrowserRouter, Navigate } from 'react-router-dom'
import RootLayout from '@/components/layout/RootLayout'
import AuthGuard from '@/components/layout/AuthGuard'
import Home from '@/pages/home/Home'
import Search from '@/pages/search/Search'
import Library from '@/pages/library/Library'
import Downloads from '@/pages/downloads/Downloads'
import Settings from '@/pages/settings/Settings'
import Profile from '@/pages/profile/Profile'
import ListeningStats from '@/pages/stats/ListeningStats'
import Wrapped from '@/pages/wrapped/Wrapped'
import NowPlaying from '@/pages/nowplaying/NowPlaying'
import Playlist from '@/pages/playlist/Playlist'
import Album from '@/pages/album/Album'
import Artist from '@/pages/artist/Artist'
import NotFound from '@/pages/errors/NotFound'
import Landing from '@/pages/landing/Landing'
import AuthPage from '@/pages/auth/AuthPage'

// Home section "See all" pages — these live under pages/home/components/
// because they only exist as drill-downs from Home's sections, not as
// independent top-level destinations.
import RecentlyPlayed from '@/pages/home/components/RecentlyPlayed'
import Trending        from '@/pages/home/components/Trending'
import Featured        from '@/pages/home/components/Featured'

// The route array is exported separately so tests can matchRoutes against
// it directly — createBrowserRouter consumes it below.
export const routes = [
  {
    path: '/',
    element: (
      <AuthGuard>
        <RootLayout />
      </AuthGuard>
    ),
    children: [
      { index: true,              element: <Home /> },
      { path: 'home',             element: <Home /> },
      { path: 'search',           element: <Search /> },
      { path: 'library',          element: <Library /> },
      { path: 'downloads',        element: <Downloads /> },
      { path: 'settings',         element: <Settings /> },
      { path: 'profile',          element: <Profile /> },
      { path: 'stats',            element: <ListeningStats /> },
      { path: 'wrapped',          element: <Wrapped /> },
      { path: 'playlist/:id',     element: <Playlist /> },
      { path: 'album/:id',        element: <Album /> },
      { path: 'artist/:id',       element: <Artist /> },

      // Legacy redirects — keep old URLs working
      { path: 'playlists',        element: <Navigate to="/library" replace /> },
      { path: 'liked',            element: <Navigate to="/library" replace /> },

      // Home section "See all" pages — routed at top level (URLs stay
      // clean, e.g. /trending) even though the components live under home/
      { path: 'recently-played',  element: <RecentlyPlayed /> },
      { path: 'trending',         element: <Trending /> },
      { path: 'featured',         element: <Featured /> },

      // Catch-all — shows a custom 404 instead of a blank page
      { path: '*',                 element: <NotFound /> },
    ],
  },
  // Full-screen player — renamed from /now-playing; keep the old URL working
  { path: '/full-player', element: <NowPlaying /> },
  { path: '/now-playing', element: <Navigate to="/full-player" replace /> },
  { path: '/login',       element: <AuthPage mode="sign-in" /> },
  { path: '/register',    element: <AuthPage mode="sign-up" /> },
  // /auth/* is as important as /auth itself: Clerk's path-routed
  // <SignUp>/<SignIn> navigate their multi-step flows to sub-paths of the
  // mount path (email-code verification, factor-one for MFA, SSO callback).
  // Without the wildcard those steps fell through to the catch-all, which
  // renders NotFound outside the guard — and mid-flow, still-signed-out
  // users landed back on the marketing page instead of completing sign-in
  // and reaching Home.
  { path: '/auth/*',      element: <AuthPage /> },
  { path: '/auth',        element: <AuthPage /> },
  { path: '/landing',     element: <Landing /> },
  // 404 for the full-player catch-all
  { path: '*',            element: <NotFound /> },
]

export const router = createBrowserRouter(routes)
