import { useEffect } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
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
import { Management } from './pages/Management'
import { Person } from './pages/Person'
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
                <Route path="/management" element={<Management />} />
                <Route path="/movie/:id" element={<MovieDetail />} />
                <Route path="/show/:id" element={<ShowDetail />} />
                <Route path="/person/:id" element={<Person />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </>
          }
        />
      </Routes>
    </LibraryProvider>
    </I18nProvider>
  )
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-premiumflix-dark flex flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="text-premiumflix-red text-6xl font-black">404</div>
      <p className="text-white text-xl font-bold">Page not found</p>
      <p className="text-premiumflix-muted text-sm">The page you're looking for doesn't exist.</p>
      <button
        onClick={() => navigate('/')}
        className="bg-white text-black font-bold px-6 py-2.5 rounded hover:bg-white/80 transition-colors"
      >
        Go Home
      </button>
    </div>
  )
}
