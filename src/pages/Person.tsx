import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { personDetail, personCredits } from '../services/tmdb'
import { profileUrlLarge } from '../types'
import type { TMDBPersonDetail, TMDBPersonCredit, TMDBPersonCredits } from '../types'
import { useLibrary } from '../contexts/LibraryContext'
import { useI18n } from '../contexts/I18nContext'

export function Person() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { movies, tvShows } = useLibrary()

  const [person, setPerson] = useState<TMDBPersonDetail | null>(null)
  const [credits, setCredits] = useState<TMDBPersonCredits | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCrew, setShowCrew] = useState(false)

  const personId = Number(id)

  useEffect(() => {
    if (!personId) { setError('Invalid person ID'); setLoading(false); return }
    let cancelled = false
    Promise.all([personDetail(personId), personCredits(personId)])
      .then(([p, c]) => {
        if (cancelled) return
        setPerson(p)
        setCredits(c)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message || 'Failed to load person')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [personId])

  const actingCredits = useMemo(() => {
    if (!credits?.cast) return []
    return [...credits.cast]
      .filter(c => c.release_date || c.first_air_date || c.episode_count)
      .sort((a, b) => {
        const dateA = a.release_date || a.first_air_date || ''
        const dateB = b.release_date || b.first_air_date || ''
        return dateB.localeCompare(dateA)
      })
  }, [credits])

  const crewCredits = useMemo(() => {
    if (!credits?.crew) return []
    const seen = new Set<number>()
    const unique: TMDBPersonCredit[] = []
    for (const c of credits.crew) {
      if (!seen.has(c.id)) { seen.add(c.id); unique.push(c) }
    }
    return unique.sort((a, b) => {
      const dateA = a.release_date || a.first_air_date || ''
      const dateB = b.release_date || b.first_air_date || ''
      return dateB.localeCompare(dateA)
    })
  }, [credits])

  // Map TMDB IDs to internal library IDs for linking
  const libraryTmdbIds = useMemo(() => {
    const movieIds = new Map<number, string>()
    const showIds = new Map<number, string>()
    for (const m of movies) { if (m.tmdbId) movieIds.set(m.tmdbId, m.id) }
    for (const s of tvShows) { if (s.tmdbId) showIds.set(s.tmdbId, s.id) }
    return { movieIds, showIds }
  }, [movies, tvShows])

  function getLibraryLink(credit: TMDBPersonCredit): string | null {
    if (credit.media_type === 'movie') {
      const internalId = libraryTmdbIds.movieIds.get(credit.id)
      if (internalId) return `/movie/${internalId}`
    } else if (credit.media_type === 'tv') {
      const internalId = libraryTmdbIds.showIds.get(credit.id)
      if (internalId) return `/show/${internalId}`
    }
    return null
  }

  function creditTitle(c: TMDBPersonCredit) { return c.title || c.name || 'Untitled' }
  function creditYear(c: TMDBPersonCredit) { return (c.release_date || c.first_air_date || '').substring(0, 4) || '—' }
  function creditPoster(c: TMDBPersonCredit) {
    return c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : undefined
  }

  function formatLife(p: TMDBPersonDetail) {
    if (!p.birthday) return null
    const birthYear = p.birthday.substring(0, 4)
    if (p.deathday) return `${birthYear} – ${p.deathday.substring(0, 4)}`
    return `Born ${birthYear} (age ${new Date().getFullYear() - parseInt(birthYear)})`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-premiumflix-dark flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-premiumflix-red border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !person) {
    return (
      <div className="min-h-screen bg-premiumflix-dark flex flex-col items-center justify-center gap-4">
        <p className="text-white text-lg">{error || 'Person not found'}</p>
        <button onClick={() => navigate(-1)} className="text-premiumflix-red hover:underline">Go back</button>
      </div>
    )
  }

  const displayedCredits = showCrew ? crewCredits : actingCredits
  const knownFor = person.known_for_department || 'Acting'

  return (
    <div className="min-h-screen bg-premiumflix-dark">
      {/* Backdrop gradient */}
      <div className="h-64 bg-gradient-to-b from-premiumflix-red/20 to-transparent" />

      {/* Header */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 -mt-48">
        <div className="flex flex-col sm:flex-row gap-6 mb-8">
          {/* Profile photo */}
          <div className="flex-shrink-0">
            <div className="w-40 h-60 rounded-lg overflow-hidden bg-premiumflix-surface shadow-xl mx-auto sm:mx-0">
              {person.profile_path ? (
                <img src={profileUrlLarge(person.profile_path)} alt={person.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-premiumflix-muted text-4xl font-bold">
                  {person.name[0]}
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-3xl sm:text-4xl font-black mb-2">{person.name}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-premiumflix-muted mb-4">
              {formatLife(person) && <span>{formatLife(person)}</span>}
              {person.place_of_birth && (<><span>•</span><span>{person.place_of_birth}</span></>)}
              <span>•</span>
              <span className="text-premiumflix-red font-medium">{knownFor}</span>
            </div>
            {person.biography && (
              <p className="text-premiumflix-muted text-sm leading-relaxed line-clamp-6 max-w-2xl">{person.biography}</p>
            )}
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 mb-6 border-b border-white/10">
          <button
            onClick={() => setShowCrew(false)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              !showCrew ? 'border-premiumflix-red text-white' : 'border-transparent text-premiumflix-muted hover:text-white'
            }`}
          >
            Acting ({actingCredits.length})
          </button>
          {crewCredits.length > 0 && (
            <button
              onClick={() => setShowCrew(true)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                showCrew ? 'border-premiumflix-red text-white' : 'border-transparent text-premiumflix-muted hover:text-white'
              }`}
            >
              Crew ({crewCredits.length})
            </button>
          )}
        </div>

        {/* Credits grid */}
        {displayedCredits.length === 0 ? (
          <p className="text-premiumflix-muted text-center py-12">No credits found.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-16">
            {displayedCredits.map((c) => {
              const libLink = getLibraryLink(c)
              const key = `${c.media_type}-${c.id}-${c.character || c.job || ''}`
              const card = (
                <>
                  <div className="aspect-[2/3] bg-black/40 relative overflow-hidden">
                    {creditPoster(c) ? (
                      <img src={creditPoster(c)!} alt={creditTitle(c)} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2">
                        <span className="text-premiumflix-muted text-xs text-center">{creditTitle(c)}</span>
                      </div>
                    )}
                    {/* In-library badge */}
                    {libLink ? (
                      <>
                        <div className="absolute top-1.5 right-1.5 bg-premiumflix-red rounded-full w-3 h-3" title="In your library" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="text-white text-xs font-bold bg-premiumflix-red/90 px-3 py-1.5 rounded">+ Add</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-white text-xs font-medium truncate">{creditTitle(c)}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-premiumflix-muted text-xs">{creditYear(c)}</span>
                      {c.vote_average != null && c.vote_average > 0 && (
                        <span className="text-premiumflix-muted text-xs">★ {c.vote_average.toFixed(1)}</span>
                      )}
                    </div>
                    {(showCrew ? c.job : c.character) && (
                      <p className="text-premiumflix-muted text-xs truncate mt-0.5">
                        {showCrew ? c.job : c.character}
                      </p>
                    )}
                  </div>
                </>
              )

              return libLink ? (
                <Link key={key} to={libLink} className="group rounded-lg overflow-hidden bg-premiumflix-surface transition-transform hover:scale-105 cursor-pointer">
                  {card}
                </Link>
              ) : (
                <Link
                  key={key}
                  to={`/add-movie?tmdbId=${c.id}&type=${c.media_type === 'tv' ? 'tv' : 'movie'}`}
                  className="group rounded-lg overflow-hidden bg-premiumflix-surface transition-transform hover:scale-105 cursor-pointer"
                >
                  {card}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
