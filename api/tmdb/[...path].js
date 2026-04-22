/**
 * Vercel Serverless Function — TMDB proxy.
 * Keeps TMDB_API_KEY on the server; the client never sees it.
 *
 * Set these in Vercel project settings → Environment Variables:
 *   TMDB_API_KEY        = your-tmdb-v3-key   (server-side only)
 *   VITE_TMDB_USE_PROXY = true               (tells the frontend to use this proxy)
 */

export default async function handler(req, res) {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB_API_KEY not configured on server' })
  }

  // req.query.path is the [...path] catch-all, e.g. ['search', 'movie']
  const pathParam = req.query.path
  const tmdbPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam ?? '')

  const target = new URL(`https://api.themoviedb.org/3/${tmdbPath}`)
  target.searchParams.set('api_key', apiKey)

  // Forward all other query params from the client (language, query, year, etc.)
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue
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
