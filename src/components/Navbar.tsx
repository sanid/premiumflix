import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { useLibrary } from '../contexts/LibraryContext'
import { movieDisplayTitle, showDisplayTitle, moviePosterUrl, showPosterUrl } from '../types'

export function Navbar() {
  const { t } = useI18n()
  const { movies, tvShows } = useLibrary()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [searchOpen])

  // Library search results (inline)
  const libraryResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    const matchedMovies = movies
      .filter(m => movieDisplayTitle(m).toLowerCase().includes(q) || m.tmdbDetail?.overview?.toLowerCase().includes(q))
      .slice(0, 5)
    const matchedShows = tvShows
      .filter(s => showDisplayTitle(s).toLowerCase().includes(q) || s.tmdbDetail?.overview?.toLowerCase().includes(q))
      .slice(0, 5)
    return { movies: matchedMovies, shows: matchedShows, total: matchedMovies.length + matchedShows.length }
  }, [searchQuery, movies, tvShows])

  const showDropdown = searchOpen && searchQuery.trim().length > 0

  function selectResult(path: string) {
    setSearchOpen(false)
    setSearchQuery('')
    navigate(path)
  }

  function searchOnline() {
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchOpen(false)
      setSearchQuery('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      searchOnline()
    }
    if (e.key === 'Escape') {
      setSearchOpen(false)
      setSearchQuery('')
    }
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-premiumflix-muted hover:text-white'}`

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-premiumflix-dark shadow-lg' : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 gap-8">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <span className="text-premiumflix-red font-black text-2xl tracking-tight">PREMIUMFLIX</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6">
            <NavLink to="/" end className={navLinkClass}>{t.nav.home}</NavLink>
            <NavLink to="/movies" className={navLinkClass}>{t.nav.movies}</NavLink>
            <NavLink to="/shows" className={navLinkClass}>{t.nav.shows}</NavLink>
            <NavLink to="/watchlist" className={navLinkClass}>{t.nav.myList}</NavLink>
            <NavLink to="/add-movie" className={navLinkClass}>{t.home.addMovie}</NavLink>
            <NavLink to="/management" className={navLinkClass}>Manage</NavLink>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            {/* Search */}
            <div className="relative" ref={searchRef}>
              {searchOpen ? (
                <div className="flex items-center">
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search library..."
                    className="bg-black/80 border border-white/30 text-white text-sm px-3 py-1.5 rounded outline-none focus:border-white w-44 sm:w-64"
                  />
                  <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery('') }} className="ml-2 text-white/60 hover:text-white">
                    <XIcon />
                  </button>
                </div>
              ) : (
                <button onClick={() => setSearchOpen(true)} className="text-premiumflix-muted hover:text-white transition-colors p-1">
                  <SearchIcon />
                </button>
              )}

              {/* Inline library results dropdown */}
              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-premiumflix-surface border border-white/20 rounded-lg shadow-2xl overflow-hidden z-[60]">
                  {libraryResults && libraryResults.total > 0 ? (
                    <div className="py-1 max-h-80 overflow-y-auto">
                      {libraryResults.movies.map(m => (
                        <button
                          key={m.id}
                          onClick={() => selectResult(`/movie/${m.id}`)}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 transition-colors text-left"
                        >
                          {moviePosterUrl(m) ? (
                            <img src={moviePosterUrl(m)} alt="" className="w-8 h-12 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-12 rounded bg-white/10 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-white text-sm truncate">{movieDisplayTitle(m)}</p>
                            <p className="text-premiumflix-muted text-xs">Movie</p>
                          </div>
                        </button>
                      ))}
                      {libraryResults.shows.map(s => (
                        <button
                          key={s.id}
                          onClick={() => selectResult(`/show/${s.id}`)}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 transition-colors text-left"
                        >
                          {showPosterUrl(s) ? (
                            <img src={showPosterUrl(s)} alt="" className="w-8 h-12 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-12 rounded bg-white/10 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-white text-sm truncate">{showDisplayTitle(s)}</p>
                            <p className="text-premiumflix-muted text-xs">TV Show</p>
                          </div>
                        </button>
                      ))}
                      <div className="border-t border-white/10">
                        <button
                          onClick={searchOnline}
                          className="w-full px-3 py-2.5 text-sm text-premiumflix-muted hover:text-white hover:bg-white/10 transition-colors text-left"
                        >
                          🔍 Search online for "<span className="text-white">{searchQuery.trim()}</span>"
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 px-3 text-center">
                      <p className="text-premiumflix-muted text-sm mb-2">No matches in your library</p>
                      <button
                        onClick={searchOnline}
                        className="text-premiumflix-red text-sm font-bold hover:underline"
                      >
                        🔍 Search TMDB & NZBs →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Settings */}
            <NavLink to="/settings" className="text-premiumflix-muted hover:text-white transition-colors p-1">
              <SettingsIcon />
            </NavLink>

            {/* Mobile menu button */}
            <button
              className="md:hidden text-white p-1"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MenuIcon />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-premiumflix-dark border-t border-white/10 py-2">
            {[
              { to: '/', label: t.nav.home },
              { to: '/movies', label: t.nav.movies },
              { to: '/shows', label: t.nav.shows },
              { to: '/watchlist', label: t.nav.myList },
              { to: '/add-movie', label: t.home.addMovie },
              { to: '/management', label: 'Manage' },
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-2 text-sm ${isActive ? 'text-white font-medium' : 'text-premiumflix-muted'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}

function SearchIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
