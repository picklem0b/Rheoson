import { createBrowserRouter } from 'react-router-dom'
import RootLayout from '@/components/layout/RootLayout'
import Home from '@/pages/home/Home'
import Search from '@/pages/search/Search'
import Library from '@/pages/library/Library'
import Downloads from '@/pages/downloads/Downloads'
import Settings from '@/pages/settings/Settings'
import NowPlaying from '@/pages/nowplaying/NowPlaying'
import Playlist from '@/pages/playlist/Playlist'
import Album from '@/pages/album/Album'
import Artist from '@/pages/artist/Artist'
import LikedSongs from '@/pages/liked/LikedSongs'

// Home section "See all" pages — these live under pages/home/components/
// because they only exist as drill-downs from Home's sections, not as
// independent top-level destinations.
import RecentlyPlayed from '@/pages/home/components/RecentlyPlayed'
import Trending        from '@/pages/home/components/Trending'
import Featured        from '@/pages/home/components/Featured'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true,              element: <Home /> },
      { path: 'search',           element: <Search /> },
      { path: 'library',          element: <Library /> },
      { path: 'downloads',        element: <Downloads /> },
      { path: 'settings',         element: <Settings /> },
      { path: 'liked',            element: <LikedSongs /> },
      { path: 'playlist/:id',     element: <Playlist /> },
      { path: 'album/:id',        element: <Album /> },
      { path: 'artist/:id',       element: <Artist /> },

      // Home section "See all" pages — routed at top level (URLs stay
      // clean, e.g. /trending) even though the components live under home/
      { path: 'recently-played',  element: <RecentlyPlayed /> },
      { path: 'trending',         element: <Trending /> },
      { path: 'featured',         element: <Featured /> },
    ],
  },
  { path: '/now-playing', element: <NowPlaying /> },
])
