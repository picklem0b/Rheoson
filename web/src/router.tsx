import { createBrowserRouter } from 'react-router-dom'
import RootLayout from '@/components/layout/RootLayout'
import Home from '@/pages/Home'
import Search from '@/pages/Search'
import Library from '@/pages/Library'
import Downloads from '@/pages/Downloads'
import Settings from '@/pages/Settings'
import NowPlaying from '@/pages/NowPlaying'
import Playlist from '@/pages/Playlist'
import Album from '@/pages/Album'
import Artist from '@/pages/Artist'
import LikedSongs from '@/pages/LikedSongs'

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