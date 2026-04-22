import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Home } from './pages/Home'
import { Movies } from './pages/Movies'
import { TVShows } from './pages/TVShows'
import { MovieDetail, ShowDetail } from './pages/Detail'
import { Player } from './pages/Player'
import { Settings } from './pages/Settings'
import { Watchlist } from './pages/Watchlist'
import { Search } from './pages/Search'
import { AddMovie } from './pages/AddMovie'
import { LibraryProvider } from './contexts/LibraryContext'
import { I18nProvider } from './contexts/I18nContext'

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

export default function App() {
  return (
    <I18nProvider>
      <LibraryProvider>
        <ScrollToTop />
      <Routes>
        {/* Full-screen player — no navbar */}
        <Route path="/play/:mode/:mediaId/:fileId" element={<Player />} />

        {/* Main layout with navbar */}
        <Route
          path="*"
          element={
            <>
              <Navbar />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/movies" element={<Movies />} />
                <Route path="/shows" element={<TVShows />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/search" element={<Search />} />
                <Route path="/add-movie" element={<AddMovie />} />
                <Route path="/movie/:id" element={<MovieDetail />} />
                <Route path="/show/:id" element={<ShowDetail />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </>
          }
        />
      </Routes>
    </LibraryProvider>
    </I18nProvider>
  )
}
