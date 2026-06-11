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
    ],
  },
  { path: '/now-playing', element: <NowPlaying /> },
])