import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/homePage'
import { NotFoundPage } from '@/pages/notFoundPage'

/**
 * Routes.
 *
 * The app is a static bundle, so a route is a file and a deep link is a rewrite
 * in whichever host serves it. The shell and the player join this file in M3 and
 * M5.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
