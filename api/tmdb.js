/**
 * Vercel Serverless Function — TMDB proxy.
 * Handles all requests to /api/tmdb/*
 *
 * Set in Vercel project → Environment Variables:
 *   TMDB_API_KEY        = your-v3-api-key   (server-side only, never sent to client)
 *   VITE_TMDB_USE_PROXY = true              (tells the frontend to route through here)
 */

export default async function handler(req, res) {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB_API_KEY not configured on server' })
  }

  // Strip /api/tmdb/ prefix to get the TMDB path, e.g. "search/movie"
  const fullPath = req.url.split('?')[0]
  const tmdbPath = fullPath.replace(/^\/api\/tmdb\/?/, '')

  const target = new URL(`https://api.themoviedb.org/3/${tmdbPath}`)
  target.searchParams.set('api_key', apiKey)

  // Forward all query params from the client (language, query, year, etc.)
  for (const [k, v] of Object.entries(req.query ?? {})) {
    target.searchParams.set(k, Array.isArray(v) ? v[0] : v ?? '')
  }

  const response = await fetch(target.toString(), {
    headers: { 'User-Agent': 'premiumflix/1.0' },
  })

  const body = await response.text()

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
  return res.status(response.status).send(body)
}
