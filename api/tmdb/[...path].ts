/**
 * Vercel Serverless Function — TMDB proxy.
 *
 * Keeps TMDB_API_KEY on the server; the client never sees it.
 * Deploy on Vercel and set:
 *   TMDB_API_KEY        = your-tmdb-key  (server-side, never exposed to client)
 *   VITE_TMDB_USE_PROXY = true           (tells the client to route through here)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB_API_KEY not configured on server' })
  }

  // Extract the TMDB path from the URL, e.g. "search/movie" from "/api/tmdb/search/movie"
  const pathParam = req.query.path
  const tmdbPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam ?? '')

  const target = new URL(`https://api.themoviedb.org/3/${tmdbPath}`)
  target.searchParams.set('api_key', apiKey)

  // Forward all query params from the client (language, query, year, etc.)
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
